import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";

interface Participant {
  id: string;
  email: string;
  stream?: MediaStream;
}

interface VideoGridProps {
  localStream: MediaStream | null;
  participants: Participant[];
  localEmail: string;
}

const VideoGrid = ({ localStream, participants, localEmail }: VideoGridProps) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const allParticipants = [
    { id: "local", email: localEmail, stream: localStream || undefined },
    ...participants,
  ];

  const getGridClass = () => {
    const count = allParticipants.length;
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 9) return "grid-cols-3";
    return "grid-cols-4";
  };

  return (
    <div className={`grid ${getGridClass()} gap-4 h-full`}>
      {allParticipants.map((participant) => (
        <VideoTile
          key={participant.id}
          participant={participant}
          isLocal={participant.id === "local"}
          videoRef={participant.id === "local" ? localVideoRef : undefined}
        />
      ))}
    </div>
  );
};

interface VideoTileProps {
  participant: Participant;
  isLocal: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

const VideoTile = ({ participant, isLocal, videoRef }: VideoTileProps) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = isLocal ? videoRef?.current : remoteVideoRef.current;
    if (video && participant.stream) {
      video.srcObject = participant.stream;
    }
  }, [participant.stream, isLocal, videoRef]);

  return (
    <Card className="relative overflow-hidden bg-secondary border-border aspect-video">
      <video
        ref={isLocal ? videoRef : remoteVideoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/60 rounded-lg backdrop-blur">
        <p className="text-sm font-medium text-white">
          {participant.email} {isLocal && "(You)"}
        </p>
      </div>
    </Card>
  );
};

export default VideoGrid;
