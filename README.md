# 009 Compliance website

Express renders the public pages with EJS. Run `npm run build` to refresh the fingerprinted assets and static sitemap, and `npm test` to run the application tests.

## Publishing content

Register public pages in `config/seo-pages.json`. Record a non-guide page’s substantive change in its `lastmod` field. Guide content, original source checks, revision dates (`modified`) and confirmed first publication dates (`published`) live in `config/guide-content.json`. Use ISO dates. Leave unverified publication dates null. Express generates the sitemap and `/llms.txt` from those registries.

Fill in verified team and company details in `config/site-identity.json`. Team keys are permanent About-page anchors. Set `defaultGuideAuthor` to a team key only after confirming authorship. Use `guideAuthors` to assign individual paths to a different team member, or null for organisational attribution. Optional empty fields are omitted.

## Notify IndexNow after a release

After the production deployment succeeds, run the following command with the public paths added or updated in that release. For a shared change, include every affected content page. The paths below are examples.

```sh
node scripts/indexnow.cjs --dry-run /guides /about
node scripts/indexnow.cjs /guides /about
```

The dry run prints the deduplicated URLs locally. The submission checks the production key file and sends those URLs to IndexNow. HTTP 200 or 202 acknowledges receipt. If the key is unavailable, verify the deployment and retry the same command.
