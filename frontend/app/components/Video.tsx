import MuxPlayer from "@mux/mux-player-react";

export default ({
  video_id,
  aspectRatio,
}: {
  video_id: string;
  aspectRatio: string;
}) => (
  <MuxPlayer
    playbackId={video_id}
    style={{ width: "100%", height: "100%", aspectRatio: aspectRatio }}
  />
);
