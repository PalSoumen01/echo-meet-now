import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Mic, MicOff, PhoneOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { User } from "@supabase/supabase-js";

const DirectCall = () => {
  const { callId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [callData, setCallData] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const signalingChannel = useRef<any>(null);

  useEffect(() => {
    const initCall = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);

      // Get call details
      const { data: call } = await supabase
        .from("direct_calls")
        .select("*")
        .eq("id", callId)
        .single();

      if (!call) {
        toast({
          title: "Call not found",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setCallData(call);
      setCallStartTime(new Date());

      // Get local media with explicit audio settings
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Set up WebRTC
        setupWebRTC(session.user.id, call, stream);
      } catch (error) {
        toast({
          title: "Media Error",
          description: "Could not access camera/microphone",
          variant: "destructive",
        });
      }
    };

    initCall();

    return () => {
      cleanup();
    };
  }, [callId, navigate]);

  const setupWebRTC = (userId: string, call: any, stream: MediaStream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Add all tracks with explicit audio
    stream.getTracks().forEach((track) => {
      console.log("Adding track:", track.kind, "enabled:", track.enabled);
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel.current?.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: {
            to: call.caller_id === userId ? call.receiver_id : call.caller_id,
            from: userId,
            candidate: event.candidate,
            callId,
          },
        });
      }
    };

    peerConnection.current = pc;

    // Set up signaling
    const channel = supabase
      .channel(`direct-call:${callId}`)
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        if (payload.to === userId && payload.callId === callId) {
          await handleOffer(payload.offer);
        }
      })
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.to === userId && payload.callId === callId) {
          await handleAnswer(payload.answer);
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        if (payload.to === userId && payload.callId === callId) {
          await handleIceCandidate(payload.candidate);
        }
      })
      .subscribe();

    signalingChannel.current = channel;

    // If caller, create offer
    if (call.caller_id === userId) {
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "offer",
          payload: {
            to: call.receiver_id,
            from: userId,
            offer,
            callId,
          },
        });
      });
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    const pc = peerConnection.current;
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    signalingChannel.current?.send({
      type: "broadcast",
      event: "answer",
      payload: {
        to: callData.caller_id === user?.id ? callData.receiver_id : callData.caller_id,
        from: user?.id,
        answer,
        callId,
      },
    });
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    const pc = peerConnection.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnection.current;
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

  const endCall = async () => {
    if (callStartTime && callData) {
      const duration = Math.floor((Date.now() - callStartTime.getTime()) / 1000);
      
      await supabase
        .from("direct_calls")
        .update({ 
          status: "ended",
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
        })
        .eq("id", callId);
    }
    
    cleanup();
    navigate("/");
  };

  const cleanup = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    peerConnection.current?.close();
    signalingChannel.current?.unsubscribe();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Direct Call</h1>
          <p className="text-sm text-muted-foreground">One-to-one video call</p>
        </div>
      </div>

      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="relative overflow-hidden bg-secondary border-border aspect-video">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/60 rounded-lg backdrop-blur">
            <p className="text-sm font-medium text-white">Remote User</p>
          </div>
        </Card>

        <Card className="relative overflow-hidden bg-secondary border-border aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/60 rounded-lg backdrop-blur">
            <p className="text-sm font-medium text-white">You</p>
          </div>
        </Card>
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
            onClick={endCall}
            className="rounded-full w-14 h-14 bg-destructive hover:bg-destructive/90"
          >
            <PhoneOff className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DirectCall;
