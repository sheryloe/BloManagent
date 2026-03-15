import type { PlatformName } from "@blog-review/shared";
import { bloggerAdapter } from "./blogger";
import { runDefaultDiscovery } from "./common";
import { genericAdapter } from "./generic";
import { naverAdapter } from "./naver";
import { tistoryAdapter } from "./tistory";
import type { BlogPlatformAdapter, DiscoveryOverrides, DiscoveryResult, DiscoverySettings } from "./types";
import { discoverWordPressApiRoot, wordpressAdapter } from "./wordpress";

const adapters = [bloggerAdapter, tistoryAdapter, naverAdapter, wordpressAdapter, genericAdapter];
const hostDetectedAdapters = [bloggerAdapter, tistoryAdapter, naverAdapter];

export const getAdapter = (platform: PlatformName) =>
  adapters.find((adapter) => adapter.platform === platform) ?? genericAdapter;

export const resolvePlatform = async (mainUrl: string, override?: PlatformName): Promise<BlogPlatformAdapter> => {
  if (override) {
    return getAdapter(override);
  }

  const url = new URL(mainUrl);
  const directMatch = hostDetectedAdapters.find((adapter) => adapter.detect(url));
  if (directMatch) {
    return directMatch;
  }

  try {
    const apiRoot = await discoverWordPressApiRoot(mainUrl);
    if (apiRoot) {
      return wordpressAdapter;
    }
  } catch {
    // Fall through to generic.
  }

  return genericAdapter;
};

export const discoverPosts = async (
  mainUrl: string,
  platform: PlatformName,
  overrides?: DiscoveryOverrides,
  settings?: DiscoverySettings,
): Promise<DiscoveryResult> => {
  const adapter = getAdapter(platform);
  if (adapter.discoverPosts) {
    return adapter.discoverPosts(mainUrl, overrides, settings);
  }

  return runDefaultDiscovery(adapter, mainUrl, overrides, settings);
};
