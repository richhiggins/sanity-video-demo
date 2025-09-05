import MuxPlayer from "@mux/mux-player-react";
import { client } from "@/sanity/lib/client";

const Video = async ({ video_ref }: { video_ref: string }) => {
  const playbackInfo =
    await client.mediaLibrary.video.getPlaybackInfo(video_ref);

  return (
    <MuxPlayer
      playbackId={playbackInfo.id}
      style={{
        width: "100%",
        height: "100%",
        aspectRatio: playbackInfo.aspectRatio,
      }}
    />
  );
};

export default Video;
