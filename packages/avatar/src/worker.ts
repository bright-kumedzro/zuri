/** Web Worker entry: meshes avatars off the main thread. */

import type { AvatarParams } from "./params.ts";
import { meshAvatar, transferables } from "./mesh.ts";

interface Job {
  id: number;
  params: AvatarParams;
  quality: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, params, quality } = e.data;
  try {
    const meshes = meshAvatar(params, quality);
    (self as unknown as Worker).postMessage({ id, meshes }, transferables(meshes));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
