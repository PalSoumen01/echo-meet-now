import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users } from "lucide-react";
import VideoGrid from "@/components/VideoGrid";
import { User } from "@supabase/supabase-js";

interface Participant {
  id: string;
  email: string;
  stream?: MediaStream;
}

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [roomName, setRoomName] = useState("");
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalingChannel = useRef<any>(null);

  useEffect(() => {
    const initRoom = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);

      // Get room details
      const { data: room } = await supabase
        .from("rooms")
        .select("name")
        .eq("id", roomId)
        .single();
      
      if (room) setRoomName(room.name);

      // Get local media
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);

        // Join room in database
        await supabase.from("room_participants").insert({
          room_id: roomId,
          user_id: session.user.id,
          email: session.user.email!,
        });

        // Set up signaling channel
        setupSignaling(session.user.id);
      } catch (error) {
        toast({
          title: "Media Error",
          description: "Could not access camera/microphone",
          variant: "destructive",
        });
      }
    };

    initRoom();

    return () => {
      cleanup();
    };
  }, [roomId, navigate]);

  const setupSignaling = (userId: string) => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT" && payload.new.user_id !== userId) {
            // New participant joined
            const newParticipant: Participant = {
              id: payload.new.user_id,
              email: payload.new.email,
            };
            setParticipants((prev) => [...prev, newParticipant]);
            
            // Create peer connection
            if (localStream) {
              createPeerConnection(payload.new.user_id, true);
            }
          } else if (payload.eventType === "UPDATE" && !payload.new.is_active) {
            // Participant left
            setParticipants((prev) => prev.filter((p) => p.id !== payload.new.user_id));
            peerConnections.current.get(payload.new.user_id)?.close();
            peerConnections.current.delete(payload.new.user_id);
          }
        }
      )
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        if (payload.to === userId) {
          await handleOffer(payload.from, payload.offer);
        }
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.to === userId) {
          await handleAnswer(payload.from, payload.answer);
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        if (payload.to === userId) {
          await handleIceCandidate(payload.from, payload.candidate);
        }
      })
      .subscribe();

    signalingChannel.current = channel;

    // Get existing participants
    supabase
      .from("room_participants")
      .select("user_id, email")
      .eq("room_id", roomId)
      .eq("is_active", true)
      .neq("user_id", userId)
      .then(({ data }) => {
        if (data) {
          setParticipants(data.map((p) => ({ id: p.user_id, email: p.email })));
        }
      });
  };

  const createPeerConnection = (peerId: string, createOffer: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === peerId ? { ...p, stream: event.streams[0] } : p
        )
      );
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel.current?.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            to: peerId,
            from: user?.id,
            candidate: event.candidate,
          },
        });
      }
    };

    peerConnections.current.set(peerId, pc);

    if (createOffer) {
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        signalingChannel.current?.send({
          type: "broadcast",
          event: "offer",
          payload: {
            to: peerId,
            from: user?.id,
            offer,
          },
        });
      });
    }

    return pc;
  };

  const handleOffer = async (peerId: string, offer: RTCSessionDescriptionInit) => {
    let pc = peerConnections.current.get(peerId);
    if (!pc) {
      pc = createPeerConnection(peerId, false);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    signalingChannel.current?.send({
      type: "broadcast",
      event: "answer",
      payload: {
        to: peerId,
        from: user?.id,
        answer,
      },
    });
  };

  const handleAnswer = async (peerId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleIceCandidate = async (peerId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const leaveCall = async () => {
    cleanup();
    navigate("/");
  };

  const cleanup = async () => {
    localStream?.getTracks().forEach((track) => track.stop());
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    
    if (user && roomId) {
      await supabase
        .from("room_participants")
        .update({ is_active: false })
        .eq("room_id", roomId)
        .eq("user_id", user.id);
    }

    signalingChannel.current?.unsubscribe();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{roomName}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4" />
            {participants.length + 1} participant{participants.length !== 0 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex-1 p-4">
        <VideoGrid
          localStream={localStream}
          participants={participants}
          localEmail={user?.email || ""}
        />
      </div>

      <div className="p-6 border-t border-border bg-card/50 backdrop-blur">
        <div className="flex items-center justify-center gap-4">
          <Button
            size="lg"
            variant={audioEnabled ? "secondary" : "destructive"}
            onClick={toggleAudio}
            className="rounded-full w-14 h-14"
          >
            {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </Button>
          <Button
            size="lg"
            variant={videoEnabled ? "secondary" : "destructive"}
            onClick={toggleVideo}
            className="rounded-full w-14 h-14"
          >
            {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            onClick={leaveCall}
            className="rounded-full w-14 h-14 bg-destructive hover:bg-destructive/90"
          >
            <PhoneOff className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Room;
