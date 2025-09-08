# Clean Next.js + Sanity + Media Library app

## Steps to update video integration

!! Take a backup of the production dataset, and work/verify against a test dataset before running the script.

### 1. Run migration script to update the video field data

https://gist.github.com/sjelfull/f7229bc398e817c213880c4e1bfe138a

e.g. ` npx tsx scripts/replaceLocalVideoAssets.ts --dry-run <projectId> <user session token> <dataset> --prod`

### 2. Update the studio - so that video picker & preview in the Studio work

https://github.com/richhiggins/sanity-video-demo/compare/fe919f5..06892ce?diff=split&w#diff-1d20c5400f2f3dee88cbdb8ea06ac9eea3f0077351c769611fe240cae9c06664

### 3. Update the GROQ query video fields

https://github.com/richhiggins/sanity-video-demo/compare/fe919f5..06892ce?diff=split&w#diff-292cd6ba24d033a0b29982ea65e7797be88ad40e75f7f0330967f087d2521fa8

### 4. Update the video player component

https://github.com/richhiggins/sanity-video-demo/compare/fe919f5..06892ce?diff=split&w#diff-84e5490f331a6c29391b37f298e7e4545c651692890b5a02cf4124214d5055c5
Usage example:
https://github.com/richhiggins/sanity-video-demo/compare/fe919f5..06892ce?diff=split&w#diff-b82ad962702183994dfec37fd4290d17cad92c42c16639f16cf050c18de9f8ab

### 5. Existing local video documents can be manually removed once the changes are verified

The script does not delete the depracated local video documents.

## Media Library

❗️Media Library needs to be enabled in [Sanity Studio config](/studio/sanity.config.ts#L136).

This repository includes basic examples of how to:

- define a video [reference](/studio/src/schemaTypes/documents/post.ts#L35) within schema,
- [query for](/frontend/sanity/lib/queries.ts#L14) the minimal video data needed for mux player,
- [serve video](/frontend/app/components/Video.tsx) using the mux-player-react component,
- [use](/frontend/app/posts/%5Bslug%5D/page.tsx#L85) the video player in a page component.

## Clean Next.js + Sanity app

This template includes a [Next.js](https://nextjs.org/) app with a [Sanity Studio](https://www.sanity.io/) – an open-source React application that connects to your Sanity project’s hosted dataset. The Studio is configured locally and can then be deployed for content collaboration.

![Screenshot of Sanity Studio using Presentation Tool to do Visual Editing](/sanity-next-preview.png)

## Features

- **Next.js 15 for Performance:** Leverage the power of Next.js 15 App Router for blazing-fast performance and SEO-friendly static sites.
- **Real-time Visual Editing:** Edit content live with Sanity's [Presentation Tool](https://www.sanity.io/docs/presentation) and see updates in real time.
- **Live Content:** The [Live Content API](https://www.sanity.io/live) allows you to deliver live, dynamic experiences to your users without the complexity and scalability challenges that typically come with building real-time functionality.
- **Customizable Pages with Drag-and-Drop:** Create and manage pages using a page builder with dynamic components and [Drag-and-Drop Visual Editing](https://www.sanity.io/visual-editing-for-structured-content).
- **Powerful Content Management:** Collaborate with team members in real-time, with fine-grained revision history.
- **AI-powered Media Support:** Auto-generate alt text with [Sanity AI Assist](https://www.sanity.io/ai-assist).
- **On-demand Publishing:** No waiting for rebuilds—new content is live instantly with Incremental Static Revalidation.
- **Easy Media Management:** [Integrated Unsplash support](https://www.sanity.io/plugins/sanity-plugin-asset-source-unsplash) for seamless media handling.

## Demo

https://template-nextjs-clean.sanity.dev

## Getting Started

### Installing the template

#### 1. Initialize template with Sanity CLI

Run the command in your Terminal to initialize this template on your local computer.

See the documentation if you are [having issues with the CLI](https://www.sanity.io/help/cli-errors).

```shell
npm create sanity@latest -- --template sanity-io/sanity-template-nextjs-clean
```

#### 2. Run Studio and Next.js app locally

Navigate to the template directory using `cd <your app name>`, and start the development servers by running the following command

```shell
npm run dev
```

#### 3. Open the app and sign in to the Studio

Open the Next.js app running locally in your browser on [http://localhost:3000](http://localhost:3000).

Open the Studio running locally in your browser on [http://localhost:3333](http://localhost:3333). You should now see a screen prompting you to log in to the Studio. Use the same service (Google, GitHub, or email) that you used when you logged in to the CLI.

### Adding content with Sanity

#### 1. Publish your first document

The template comes pre-defined with a schema containing `Page`, `Post`, `Person`, and `Settings` document types.

From the Studio, click "+ Create" and select the `Post` document type. Go ahead and create and publish the document.

Your content should now appear in your Next.js app ([http://localhost:3000](http://localhost:3000)) as well as in the Studio on the "Presentation" Tab

#### 2. Import Sample Data (optional)

You may want to start with some sample content and we've got you covered. Run this command from the root of your project to import the provided dataset (sample-data.tar.gz) into your Sanity project. This step is optional but can be helpful for getting started quickly.

```shell
npm run import-sample-data
```

#### 3. Extending the Sanity schema

The schema for the `Post` document type is defined in the `studio/src/schemaTypes/post.ts` file. You can [add more document types](https://www.sanity.io/docs/schema-types) to the schema to suit your needs.

### Deploying your application and inviting editors

#### 1. Deploy Sanity Studio

Your Next.js frontend (`/frontend`) and Sanity Studio (`/studio`) are still only running on your local computer. It's time to deploy and get it into the hands of other content editors.

Back in your Studio directory (`/studio`), run the following command to deploy your Sanity Studio.

```shell
npx sanity deploy
```

#### 2. Deploy Next.js app to Vercel

You have the freedom to deploy your Next.js app to your hosting provider of choice. With Vercel and GitHub being a popular choice, we'll cover the basics of that approach.

1. Create a GitHub repository from this project. [Learn more](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).
2. Create a new Vercel project and connect it to your Github repository.
3. Set the `Root Directory` to your Next.js app.
4. Configure your Environment Variables.

#### 3. Invite a collaborator

Now that you’ve deployed your Next.js application and Sanity Studio, you can optionally invite a collaborator to your Studio. Open up [Manage](https://www.sanity.io/manage), select your project and click "Invite project members"

They will be able to access the deployed Studio, where you can collaborate together on creating content.

## Resources

- [Sanity documentation](https://www.sanity.io/docs)
- [Next.js documentation](https://nextjs.org/docs)
- [Join the Sanity Community](https://slack.sanity.io)
- [Learn Sanity](https://www.sanity.io/learn)
