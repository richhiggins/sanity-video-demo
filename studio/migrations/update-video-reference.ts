import {createClient} from '@sanity/client'
import {defineMigration} from 'sanity/migrate'

export default defineMigration({
  title:
    'Adds a Media Library video reference field to post where an existing video filename matches a video title in media library.',
  documentTypes: ['post'],
  filter: '!(_id in path("drafts.**"))', // published documents only
  migrate: {
    async document(doc) {
      if (!doc.OldVideo) return [] // skip if no existing video field

      // Sanity client with recent apiversion, run `npx sanity debug --secrets` to obtain your auth token.
      // You'll need read/write access to the source dataset and Media Library.
      const client = createClient({
        projectId: process.env.SANITY_STUDIO_PROJECT_ID,
        dataset: process.env.SANITY_STUDIO_DATASET,
        useCdn: false,
        headers: {
          Authorization: `Bearer ${process.env.VIDEO_MIGRATION_TOKEN}`,
        },
        apiVersion: '2025-07-24',
      })

      // 1. fetch the filename from the existing video field
      const fetchExistingVideoFilename = await client.fetch(
        `*[_type == "post" && _id == "${doc._id}"][0]{OldVideo{asset->{originalFilename}}}`,
      )

      const existingVideoFilename = fetchExistingVideoFilename.OldVideo.asset.originalFilename
      console.log('Old video filename: ' + existingVideoFilename)

      // 2. fetch video from ML using the existing video filename
      const fetchMediaLibraryVideo = await fetch(
        `https://api.sanity.io/v2025-07-24/media-libraries/${process.env.MEDIA_LIBRARY_ID}/query?query=%2A%5B_type%20%3D%3D%20%22sanity.asset%22%20%26%26%20title%20%3D%3D%22${existingVideoFilename}%22%20%5D%5B0%5D%7B...%7D`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.VIDEO_MIGRATION_TOKEN}`,
          },
        },
      )
      const videoData = await fetchMediaLibraryVideo.json()
      console.log(
        'Video found matching ' + existingVideoFilename + ', id: ' + videoData.result?._id,
      )

      // 3. create the dataset link document for the video
      const createLinkDocument = await fetch(
        `https://${process.env.SANITY_STUDIO_PROJECT_ID}.api.sanity.io/v2025-07-24/assets/media-library-link/${process.env.SANITY_STUDIO_DATASET}`,
        {
          method: 'POST',
          headers: {
            accept: '*/*',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.VIDEO_MIGRATION_TOKEN}`,
          },
          body: JSON.stringify({
            assetId: videoData.result?._id,
            mediaLibraryId: process.env.MEDIA_LIBRARY_ID,
            assetInstanceId: videoData.result?.currentVersion._ref,
          }),
        },
      )

      const linkData = await createLinkDocument.json()
      console.log('Link document created, id: ' + linkData.document?._id)

      // 4. set the video reference field in the post document
      const patchResult = await client
        .patch(doc._id)
        .set({
          video: {
            _type: 'sanity.video',
            media: {
              _type: 'globalDocumentReference',
              _ref: linkData.document?.media._ref,
              _weak: true,
            },
            asset: {
              _type: 'reference',
              _ref: linkData.document?._id,
            },
          },
        })
        .commit()

      console.log(patchResult.title + ' updated\n')

      return [] // doesn't actually return anything :)
    },
  },
})
