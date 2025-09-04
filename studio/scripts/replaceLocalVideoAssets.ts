#!/usr/bin/env tsx
import {type SanityClient, SanityDocument, SanityReference, createClient} from '@sanity/client'
import chalk from 'chalk'
import ora from 'ora'

interface VideoAsset extends SanityDocument {
  _type: 'sanity.videoAsset'
  media?: SanityReference // Global document reference like "media-library:mlXXXXXXX:XXXXXX"
  uploadId?: string
  originalFilename?: string
  size?: number
}

interface MediaLibraryAsset {
  _id: string
  container?: {
    _id: string
    _type: string
  }
}

interface ReferenceTarget {
  _ref: string
  _type: string
  _dataset?: string
  _weak?: boolean
}

interface GlobalDocumentReference {
  _type: 'globalDocumentReference'
  _ref: string
  _weak?: boolean
}

interface PatchOperation {
  documentId: string
  path: string
  oldReference: ReferenceTarget
  newReference: GlobalDocumentReference
}

interface ScriptOptions {
  projectId: string
  token: string
  dataset: string
  dryRun: boolean
  verbose: boolean
  prod: boolean
}

/**
 * Parse a global document reference like "media-library:mlXXXXXXX:XXXXXX"
 * Returns { libraryId, instanceId } or null if invalid
 */
function parseMediaReference(
  reference: string | SanityReference,
): {libraryId: string; instanceId: string} | null {
  if (typeof reference === 'object' && '_type' in reference && reference._type === 'reference') {
    reference = reference._ref
  }
  if (!reference || typeof reference !== 'string') {
    return null
  }

  const parts = reference.split(':')
  if (parts.length !== 3 || parts[0] !== 'media-library') {
    return null
  }

  return {
    libraryId: parts[1],
    instanceId: parts[2],
  }
}

/**
 * Return GROQ-like path strings (e.g. "image.asset", "gallery[_key=="abc"].asset")
 * for every object whose key === "asset" and whose value is a reference (optionally to a specific assetId).
 */
function findAssetPaths(doc: SanityDocument, opts?: {onlyRefTo?: string}): string[] {
  const out: string[] = []
  const stack: Array<{n: any; path: Array<string>}> = [{n: doc, path: []}]

  const isRefTo = (v: any) =>
    v &&
    typeof v === 'object' &&
    v._type === 'reference' &&
    (opts?.onlyRefTo ? v._ref?.replace(/^drafts\./, '') === opts.onlyRefTo : true)

  while (stack.length) {
    const {n, path} = stack.pop()!
    if (Array.isArray(n)) {
      for (let i = n.length - 1; i >= 0; i--) {
        const item = n[i]
        const key = item && typeof item === 'object' && item._key
        stack.push({
          n: item,
          path: [...path, key ? `[_key=="${key}"]` : `[${i}]`],
        })
      }
    } else if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        const p = [...path, k]
        // match asset objects whose value is a (possibly specific) reference
        if (k === 'asset' && isRefTo(v)) {
          out.push(p.map((seg, i) => (seg.startsWith('[') ? seg : (i ? '.' : '') + seg)).join(''))
        }
        stack.push({n: v, path: p})
      }
    }
  }
  return out
}

/**
 * Query all video assets in the dataset
 */
async function queryAllVideoAssets(client: SanityClient): Promise<VideoAsset[]> {
  const query = `*[_type == "sanity.videoAsset"] {
    _id,
    _type,
    _rev,
    uploadId,
    originalFilename,
    size,
    media
  }`

  return await client.fetch<VideoAsset[]>(query)
}

/**
 * Query all documents that reference a specific asset
 */
async function findDocumentsReferencingAsset(
  client: SanityClient,
  assetId: string,
): Promise<SanityDocument[]> {
  // Remove drafts prefix if present for consistent matching
  const cleanAssetId = assetId.replace(/^drafts\./, '')

  // Query for documents that have a reference to this asset
  const query = `*[references($assetId) || references($draftAssetId)] {
    ...
  }`

  const params = {
    assetId: cleanAssetId,
    draftAssetId: `drafts.${cleanAssetId}`,
  }

  return await client.fetch<SanityDocument[]>(query, params)
}

/**
 * Generate patch operations for replacing local references with global document references
 */
function generatePatchOperations(
  document: SanityDocument,
  videoAsset: VideoAsset,
  libraryId: string,
  instanceId: string,
  containerId: string,
): PatchOperation[] {
  const operations: PatchOperation[] = []

  // Find all paths in the document that reference this asset
  const assetPaths = findAssetPaths(document, {onlyRefTo: videoAsset._id})

  for (const path of assetPaths) {
    // Replace the 'asset' path with global reference to the video asset instance
    operations.push({
      documentId: document._id,
      path: path,
      oldReference: {
        _ref: videoAsset._id,
        _type: 'reference',
      },
      newReference: {
        _type: 'globalDocumentReference',
        _ref: `media-library:${libraryId}:${instanceId}`,
        _weak: true,
      },
    })

    // Replace the 'media' path with global reference to the container
    const mediaPath = path.replace(/\.asset$/, '.media')
    operations.push({
      documentId: document._id,
      path: mediaPath,
      oldReference: {
        _ref: '',
        _type: 'reference',
      },
      newReference: {
        _type: 'globalDocumentReference',
        _ref: `media-library:${libraryId}:${containerId}`,
        _weak: true,
      },
    })
  }

  return operations
}

/**
 * Apply patch operations to documents
 */
async function applyPatches(
  client: SanityClient,
  operations: PatchOperation[],
  dryRun: boolean,
): Promise<void> {
  // Group operations by document ID
  const operationsByDocument = new Map<string, PatchOperation[]>()

  for (const op of operations) {
    if (!operationsByDocument.has(op.documentId)) {
      operationsByDocument.set(op.documentId, [])
    }
    operationsByDocument.get(op.documentId)!.push(op)
  }

  for (const [documentId, docOperations] of operationsByDocument) {
    if (dryRun) {
      console.log(chalk.yellow(`[DRY RUN] Would patch document ${documentId}:`))
      for (const op of docOperations) {
        console.log(chalk.gray(`  - Path: ${op.path}`))
        if (op.oldReference._ref) {
          console.log(chalk.red(`    From: ${op.oldReference._ref}`))
        }
        console.log(chalk.green(`    To: ${op.newReference._ref}`))
      }
    } else {
      try {
        const transaction = client.transaction()

        // Create a single patch for the document with all operations
        let patch = client.patch(documentId)

        for (const op of docOperations) {
          // Chain the set operations
          patch = patch.set({[op.path]: op.newReference})
        }

        await transaction.patch(patch).commit()
        console.log(
          chalk.green(`✓ Patched document ${documentId} (${docOperations.length} references)`),
        )
      } catch (error) {
        console.error(chalk.red(`✗ Failed to patch document ${documentId}:`), error)
      }
    }
  }
}

/**
 * Query for media library asset by looking up the resolved asset
 */
async function getMediaLibraryAssetInfo(
  client: SanityClient,
  videoAsset: VideoAsset,
): Promise<{libraryId: string; instanceId: string; containerId: string} | null> {
  // Parse the media reference to get library id and instance id
  if (!videoAsset.media) {
    return null
  }

  const parsed = parseMediaReference(videoAsset.media)
  if (!parsed) {
    return null
  }

  const {libraryId, instanceId} = parsed

  // Create a client configured for the media library
  const mlClient = client.withConfig({
    '~experimental_resource': {
      type: 'media-library',
      id: libraryId,
    },
  })

  // Query for the instance and its parent container
  const query = `*[_id == $assetId][0] {
    _id,
    "container": *[_type == "sanity.asset" && currentVersion._ref == $assetId][0]
  }`

  const result = await mlClient.fetch<MediaLibraryAsset | null>(query, {assetId: instanceId})

  if (!result || !result.container) {
    return null
  }

  return {
    libraryId,
    instanceId,
    containerId: result.container._id,
  }
}

/**
 * Main execution function
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: tsx replaceLocalVideoAssets.ts [options] <projectId> <token> [dataset]

Options:
  --dry-run, -d    Preview patches without applying them
  --verbose, -v    Show detailed output
  --prod           Use production API (api.sanity.io) instead of staging (api.sanity.work)
  --help, -h       Show this help message

Arguments:
  projectId        Sanity project ID
  token            Sanity auth token
  dataset          Dataset name (default: production)

Example:
  tsx replaceLocalVideoAssets.ts --dry-run abc123 my-token staging
    `)
    process.exit(0)
  }

  const dryRun = args.includes('--dry-run') || args.includes('-d')
  const verbose = args.includes('--verbose') || args.includes('-v')
  const prod = args.includes('--prod')

  // Filter out flags to get positional arguments
  const positionalArgs = args.filter((arg) => !arg.startsWith('-'))

  if (positionalArgs.length < 2) {
    console.error(chalk.red('Error: Project ID and token are required'))
    console.log('Run with --help for usage information')
    process.exit(1)
  }

  const options: ScriptOptions = {
    projectId: positionalArgs[0],
    token: positionalArgs[1],
    dataset: positionalArgs[2] || 'production',
    dryRun,
    verbose,
    prod,
  }

  console.log(chalk.blue('Starting video asset reference replacement...'))
  console.log(chalk.gray(`Project: ${options.projectId}`))
  console.log(chalk.gray(`Dataset: ${options.dataset}`))
  console.log(
    chalk.gray(`API: ${prod ? 'production (api.sanity.io)' : 'staging (api.sanity.work)'}`),
  )
  console.log(chalk.gray(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`))
  console.log()

  // Create Sanity client
  const client = createClient({
    projectId: options.projectId,
    dataset: options.dataset,
    token: options.token,
    apiVersion: 'vX',
    useCdn: false,
    apiHost: prod ? 'https://api.sanity.io' : 'https://api.sanity.work',
    perspective: 'raw',
  })

  // Step 1: Query all video assets
  const spinner = ora('Querying video assets...').start()

  let videoAssets: VideoAsset[]
  try {
    videoAssets = await queryAllVideoAssets(client)
    spinner.succeed(`Found ${videoAssets.length} video assets`)
  } catch (error) {
    spinner.fail('Failed to query video assets')
    console.error(error)
    process.exit(1)
  }

  if (videoAssets.length === 0) {
    console.log(chalk.yellow('No video assets found'))
    process.exit(0)
  }

  if (verbose) {
    console.log(chalk.blue('\nFound video assets:'))
    videoAssets.forEach((asset, index) => {
      console.log(chalk.gray(`${index + 1}. ID: ${asset._id}`))
      console.log(chalk.gray(`   Original filename: ${asset.originalFilename || 'unknown'}`))
      console.log(
        chalk.gray(
          `   Size: ${asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : 'unknown'}`,
        ),
      )
      console.log(chalk.gray(`   Media reference: ${asset.media?._ref || 'none'}`))
    })
  }

  // Step 2-5: Process each video asset
  const allPatchOperations: PatchOperation[] = []

  for (let i = 0; i < videoAssets.length; i++) {
    const asset = videoAssets[i]

    if (verbose) {
      console.log(chalk.cyan(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`))
      console.log(chalk.cyan(`Processing asset ${i + 1}/${videoAssets.length}: ${asset._id}`))
    }

    // Step 2: Get the media library asset info for this video asset
    const mediaLibraryInfo = await getMediaLibraryAssetInfo(client, asset)

    if (!mediaLibraryInfo) {
      if (verbose) {
        console.log(chalk.yellow(`  ⚠ Skipping - no media library reference found`))
        if (!asset.media) {
          console.log(
            chalk.yellow(
              `    Reason: No 'media' field in video asset`,
              JSON.stringify(asset, null, 2),
            ),
          )
        } else {
          const parsed = parseMediaReference(asset.media)
          if (!parsed) {
            console.log(chalk.yellow(`    Reason: Invalid media reference format: ${asset.media}`))
          } else {
            console.log(
              chalk.yellow(
                `    Reason: Could not query media library asset or container`,
                JSON.stringify({asset, parsed}, null, 2),
              ),
            )
          }
        }
      }
      continue
    }

    const {libraryId, instanceId, containerId} = mediaLibraryInfo

    if (verbose) {
      console.log(chalk.green(`  ✓ Found media library info:`))
      console.log(chalk.gray(`    Library ID: ${libraryId}`))
      console.log(chalk.gray(`    Instance ID: ${instanceId}`))
      console.log(chalk.gray(`    Container ID: ${containerId}`))
    }

    // Step 3: Find documents referencing this asset
    const spinner = ora(`Finding references to ${asset._id}...`).start()

    try {
      const referencingDocs = await findDocumentsReferencingAsset(client, asset._id)

      if (referencingDocs.length === 0) {
        spinner.info(`No documents reference ${asset._id}`)
        if (verbose) {
          console.log(chalk.yellow(`  ℹ No referencing documents found`))
        }
        continue
      }

      spinner.succeed(`Found ${referencingDocs.length} documents referencing ${asset._id}`)

      if (verbose) {
        console.log(chalk.green(`  ✓ Found ${referencingDocs.length} referencing documents:`))
      }

      // Step 4-5: Generate patches for each document
      for (const doc of referencingDocs) {
        const operations = generatePatchOperations(doc, asset, libraryId, instanceId, containerId)
        allPatchOperations.push(...operations)

        if (verbose) {
          console.log(chalk.gray(`    Document: ${doc._id}`))
          console.log(chalk.gray(`      Type: ${doc._type || 'unknown'}`))

          if (operations.length > 0) {
            console.log(
              chalk.gray(
                `      References to update: ${operations.length / 2} (${operations.length / 2} asset + ${operations.length / 2} media)`,
              ),
            )

            // Show the paths that will be updated
            const assetPaths = operations
              .filter((op) => op.path.includes('asset'))
              .map((op) => op.path)
            const mediaPaths = operations
              .filter((op) => op.path.includes('media'))
              .map((op) => op.path)

            if (assetPaths.length > 0) {
              console.log(chalk.gray(`      Asset paths: ${assetPaths.join(', ')}`))
            }
            if (mediaPaths.length > 0) {
              console.log(chalk.gray(`      Media paths: ${mediaPaths.join(', ')}`))
            }
          } else {
            console.log(chalk.yellow(`      No operations generated (might be already updated)`))
          }
        }
      }
    } catch (error) {
      spinner.fail(`Failed to process asset ${asset._id}`)
      console.error(error)
    }
  }

  // Step 6: Apply patches or show dry run results
  console.log()
  if (allPatchOperations.length === 0) {
    console.log(chalk.yellow('No references found to update'))
    process.exit(0)
  }

  // Summary statistics
  const uniqueDocuments = new Set(allPatchOperations.map((op) => op.documentId)).size
  const assetOps = allPatchOperations.filter((op) => op.path.includes('asset')).length
  const mediaOps = allPatchOperations.filter((op) => op.path.includes('media')).length

  console.log(chalk.blue(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`))
  console.log(chalk.blue(`Summary:`))
  console.log(chalk.gray(`  Total operations: ${allPatchOperations.length}`))
  console.log(chalk.gray(`  Unique documents: ${uniqueDocuments}`))
  console.log(chalk.gray(`  Asset references: ${assetOps}`))
  console.log(chalk.gray(`  Media references: ${mediaOps}`))

  if (dryRun) {
    console.log(chalk.yellow('\n=== DRY RUN MODE - No changes will be made ===\n'))
  }

  await applyPatches(client, allPatchOperations, dryRun)

  if (dryRun) {
    console.log(chalk.yellow('\n=== DRY RUN COMPLETE - No changes were made ==='))
    console.log(chalk.gray('Run without --dry-run to apply these changes'))
  } else {
    console.log(chalk.green('\n✓ All patches applied successfully'))
  }
}

// Run the script
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})
