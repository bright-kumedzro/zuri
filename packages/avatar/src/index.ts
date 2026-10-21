/**
 * @zuri/avatar: stylized 3D avatars generated entirely from code. The same seed always gives the same face.
 *
 *   const stage = new AvatarStage({ canvas });
 *   stage.show(createAvatar("ada@example.com"));
 */

import { buildAvatar, type Avatar, type BuildOptions } from "./build.ts";
import { generateAvatar, type AvatarOptions } from "./params.ts";

export * from "./params.ts";
export { buildAvatar, disposeAvatar, type Avatar, type BuildOptions } from "./build.ts";
export { AvatarStage, renderAvatarImage, snapshotAvatar, type Framing, type ImageOptions, type SnapshotOptions, type StageOptions } from "./stage.ts";
export { AvatarFactory, type FactoryOptions } from "./factory.ts";
export { meshAvatar, type AvatarMeshes } from "./mesh.ts";
export { assembleAvatar } from "./build.ts";

export function createAvatar(seed: string, options: AvatarOptions & BuildOptions = {}): Avatar {
  return buildAvatar(generateAvatar(seed, options), options);
}
