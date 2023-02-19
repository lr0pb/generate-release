import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
// import * as fs from 'fs';
// import * as path from 'path';

let token: string;

const octobase = {
  owner: context.repo.owner,
  repo: context.repo.repo,
};

interface ChangedFiles {
  fileName: string,
  patch?: string,
}

async function getAllChangedFiles(
  packagePath: string
): Promise<Record<string, ChangedFiles>> {
  const octokit = getOctokit(token);
  const { before, after } = context.payload;

  // Get the list of commits between the before and after commits
  const { data: commitsData } = await octokit.rest.repos.compareCommits({
    ...octobase,
    base: before,
    head: after,
  });

  // Iterate over each commit and get the list of changed files
  const changedFiles: Record<string, ChangedFiles> = {};
  for (const commit of commitsData.commits) {
    const { data: filesData } = await octokit.rest.repos.getCommit({
      ...octobase,
      ref: commit.sha,
    });
    if (Array.isArray(filesData.files)) {
      filesData.files.forEach((file) => {
        changedFiles[file.filename] = {
          fileName: file.filename,
          patch: file.filename === packagePath ? file.patch : undefined,
        };
      });
    }
  }

  // Return the list of all changed files in the push
  return changedFiles;
}

function getNewVersion(packageData: ChangedFiles): string | undefined {
  const patch = packageData.patch;
  if (!patch) return;
  const isVersionUpdated = patch.includes('version');
  console.log(`Is version updated: ${isVersionUpdated}`);
  if (!isVersionUpdated) return;
  const match = patch.match(/^\+.*"version"\s*:\s*"(.*)"/m);
  return match ? match[1] : undefined;
}

async function createRelease(version: string): Promise<void> {
  try {
    const tag = `v${version}`;
    const body = '# Version ' + version + '\n' +
    '🚀 This release was generated by `generate-release` action!\n\n' +
    '[**[Learn more]**](https://github.com/lr0pb/generate-release)';

    const octokit = getOctokit(token);

    const { data: releaseData } = await octokit.rest.repos.createRelease({
      ...octobase,
      tag_name: tag,
      name: tag,
      body,
    });

    core.info(`Created release ${releaseData.name} 🚀`);
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

async function run() {
  try {
    if (context.eventName !== 'push') {
      core.setFailed('Generate Release action can only run on push event');
      return;
    }
    if (!process.env.GITHUB_WORKSPACE) {
      return;
    }
    token = core.getInput('token', { required: true });
    const basePath = process.env.GITHUB_WORKSPACE as string;
    const packagePath = core
      .getInput('package-path', { required: false })
      ?.replace(/^\//, '') || 'package.json';

    const changedFiles = await getAllChangedFiles(packagePath);
    console.log(changedFiles);
    if (changedFiles[packagePath]) {
      const newVersion = getNewVersion(changedFiles[packagePath]);
      console.log(`New version: ${newVersion}`);
      if (newVersion) {
        await createRelease(newVersion);
      }
    }

  } catch (error: any) {
    console.log(error);
    core.setFailed(error.message);
  }
}

run();
