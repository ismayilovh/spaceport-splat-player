import * as pc from 'playcanvas';

export class GSplatFramePlayerDoubleBuffer {
  /**
   * @param {pc.Application} app
   * @param {pc.Entity} parent
   * @param {pc.Asset[]} frames  // Array of 'gsplat' assets (may be empty initially)
   * @param {{
   *   fps?: number,
   *   loop?: boolean,
   *   aabbSize?: number,
   *   preloadWindow?: number,
   *   preloadAll?: boolean,
   *   autoTrimBatchSize?: number   // new: automatically remove this many oldest frames after a new batch loads
   * }} opts
   */
  constructor(app, parent, frames = [], opts = {}) {
    this.app = app;
    this.entity = parent;
    this.frames = frames || [];
    this.fps = opts.fps ?? 24;
    this.loop = opts.loop ?? true;
    this.aabbSize = opts.aabbSize ?? 10;
    this.inflight = new Set();
    this.preloadWindow = Math.max(0, opts.preloadWindow ?? 12);
    this.preloadAll = !!opts.preloadAll;
    this.autoTrimBatchSize = Math.max(0, opts.autoTrimBatchSize ?? 0); // new
    this._readyAssetIds = new Set();  
    this._pendingTrim = 0;          // how many frames we still want to remove  

    this.firstBatchSize = 0;
    this.prevBatchSize = 0
    this.totalBatchSize = 0

    // --- two child entities with GSplat component ---
    this.front = new pc.Entity('front');
    this.back  = new pc.Entity('back');
    this.front.addComponent('gsplat');
    this.back.addComponent('gsplat');
    this.entity.addChild(this.front);
    this.entity.addChild(this.back);

    // --- large, fixed bounds (to prevent culling pops) ---
    const half = new pc.Vec3(this.aabbSize, this.aabbSize, this.aabbSize);
    const bb1 = new pc.BoundingBox(new pc.Vec3(0, 0, 0), half.clone ? half.clone() : new pc.Vec3(this.aabbSize, this.aabbSize, this.aabbSize));
    const bb2 = new pc.BoundingBox(new pc.Vec3(0, 0, 0), half);
    this.front.gsplat.customAabb = bb1;
    this.back.gsplat.customAabb  = bb2;

    // --- initial state ---
    this.i = 0;           // index of currently-displayed frame
    this.nextIndex = 0;   // index prepared for the next swap
    this.accum = 0;
    this._baseFrame = 0; // absolute index of frames[0]  


    // If initial frames provided and non-empty, bind first asset
    if (this.frames.length > 0) {
      this.front.gsplat.asset = this.frames[0];
      this.front.gsplat.show();
      this.back.gsplat.hide();

      this._prepNext((this.i + 1) % Math.max(1, this.frames.length));
      this._maintainWindow();
    } else {
      this.front.gsplat.hide();
      this.back.gsplat.hide();
    }

    this._onUpdate = this.update.bind(this);
    this.app.on('update', this._onUpdate);
  }

  destroy() {
    this.app.off('update', this._onUpdate);

    [this.front, this.back].forEach(e => {
      const a = e.gsplat?.asset;
      if (a) {
        e.gsplat.asset = null;
        if (a.resource) a.unload();
      }
    });

    this.frames.forEach(a => { if (a?.resource) a.unload(); });

    this.front.destroy();
    this.back.destroy();
  }

 

_resolveAssetId(val) {
  if (!val) return null;
  if (typeof val === 'number') return val;
  if (val && typeof val.id === 'number') return val.id;
  // Try lookup by name or object via app.assets (safe fallback)
  try {
    const found = this.app && this.app.assets ? this.app.assets.get(val) : null;
    if (found && typeof found.id === 'number') return found.id;
  } catch (e) {}
  return null;
}

  /**
 * Async appendFrames: appends new frames and waits for them to load.
 * Resolves when all appended frames are ready and trimming (if enabled) is done.
 * @param {pc.Asset[]} newFrames
 * @returns {Promise<void>}
 */

// inside class
 async appendFrames(newFrames) {
  this._trimLock = true;   // prevent auto-trim while appending/setting up
  if (!newFrames || newFrames.length === 0) return;

  this.totalBatchSize += newFrames.length;
  

  const wasEmpty = this.frames.length === 0;
  newFrames.forEach(a => {
    try { if (this.app.assets && !this.app.assets.getById?.(a.id)) this.app.assets.add(a); } catch (e) { /* ignore */ }
    this.frames.push(a);
  });

  console.log("length", this.frames.length)

  if (wasEmpty && this.frames.length > 0) {
    this.i = 0;
    this.firstBatchSize = this.frames.length;
    this.front.gsplat.asset = this.frames[0];
    this.front.gsplat.show();
    this.back.gsplat.hide();
    this._prepNext((this.i +1 ) % this.frames.length);
  }

  

  // if (this.totalBatchSize > this.firstBatchSize && this.currentFrameAbsolute > 3) {
  //   this._pendingTrim += this.prevBatchSize;
  //   // attempt immediate trim
  //   this._trimLock = false;  

  //   this._tryTrimPending();
  // }

 

   this.prevBatchSize = newFrames.length;



  //  // --- initial state ---
  //   this.i = 0;
  //   if (this.frames.length > 0) {
  //     this.front.gsplat.asset = this.frames[0];
  //   }
  //   // important: show/hide (not entity.enabled)
  //   this.front.gsplat.show();
  //   this.back.gsplat.hide();

  //   // prepare next frame (assign asset, flip only when resource is ready)
  //   this._prepNext((this.i + 1) % Math.max(1, this.frames.length));

  //   // fill initial window
  //   this._maintainWindow();

  //   this.accum = 0;
  //   this._onUpdate = this.update.bind(this);
  //   this.app.on('update', this._onUpdate);
  
 

}

_tryTrimPending() {
  if (!this._pendingTrim || this._pendingTrim <= 0) return;
  const removed = this._autoTrimBatch(this._pendingTrim);
  if (removed > 0) {
    this._pendingTrim = Math.max(0, this._pendingTrim - removed);
  }
  // if removed === 0 it means not safe yet; caller (update) will try again next frame
}
_autoTrimBatch(count = this.autoTrimBatchSize) {
  if (count <= 0) return 0;
  if (!this.frames || this.frames.length === 0) return 0;
  if (this._trimLock) return 0; // defer trimming while locked  

  // const boundFrontId = this._resolveAssetId(this.front.gsplat.asset);
  // const boundBackId  = this._resolveAssetId(this.back.gsplat.asset);
 const boundFrontId = (this.front.gsplat.asset);
  const boundBackId  = (this.back.gsplat.asset); 

  let removableCount = 0;
  const maxIndexToConsider = Math.min(this.i, this.frames.length); // Don't go past current frame  

  const limit = Math.min(count, maxIndexToConsider);

  for (let k = 0; k < limit; k++) {
    const asset = this.frames[k];
    if (!asset) {
      removableCount++;
      continue;
    }

    const aid = asset.id;
    const isBound = (aid === boundFrontId) || (aid === boundBackId);
    const isInflight =  this.inflight.has(asset);
    // const isReady = this._readyAssetIds ? this._readyAssetIds.has(aid) : !!(asset.resource && asset.loaded);
    const safeToUnload =  !isInflight && !isBound;

    if (safeToUnload) {
      removableCount++;
      continue;
    }
    // stop on first non-removable asset to preserve contiguous prefix
    break;
  }

  if (removableCount <= 0) {
    return 0;
  }

  

  // Unload and cleanup removable assets
for (let r = 0; r < removableCount; r++) {
  const asset = this.frames[r];
  if (!asset) continue;

  // double-check it's not currently bound (should already be checked earlier)
  const aid = (asset && typeof asset.id === 'number') ? asset.id : null;
  const boundFrontId = this._resolveAssetId(this.front.gsplat.asset);
  const boundBackId  = this._resolveAssetId(this.back.gsplat.asset);
  if (aid !== null && (aid === boundFrontId || aid === boundBackId)) {
    console.warn('Skipping removal because asset still bound', asset.name || aid);
    continue;
  }

  // centralized removal helper
  this._removeAssetCompletely(asset);
}
  // Remove from frames array
  this.frames.splice(0, removableCount);
  this._baseFrame = (this._baseFrame || 0) + removableCount;  



  // Adjust indices
  this.i = Math.max(0, this.i - removableCount);
  if (this.nextIndex != null && this.nextIndex !== undefined) 
    this.nextIndex = Math.max(0, this.nextIndex - removableCount);

  // maintain window and ensure next prepared
  try { this._maintainWindow(); } catch (e) { console.warn(e); }
  if (this.frames.length > 0) {
    const nn = (this.i +1) % this.frames.length;
    try { this._prepNext(nn); } catch (e) {}
  }

  return removableCount;
}
get currentFrameAbsolute() {  
  // absolute frame index shown right now  
  return this._baseFrame + this.i;  
}  

_removeAssetCompletely(asset) {
  if (!asset) return;
  // mark for deferred cleanup
  this._deferredRemovals = this._deferredRemovals || [];
  this._deferredRemovals.push({ asset, time: Date.now() });
  // remove from ready/inflight sets now
  // if (this._readyAssetIds && typeof asset.id === 'number') this._readyAssetIds.delete(asset.id);
  if (this.inflight && asset) this.inflight.delete(asset);
}




  _getWindowIndices() {
    const set = new Set();
    const n = Math.max(1, this.frames.length);
    for (let k = 0; k <= this.preloadWindow; k++) {

      const idx =  (this.i + k + n ) % n ; //< 0 ? 0:  (this.i + k + n )% n
      set.add(idx);
    }
    return set;
  }

 

  _maintainWindow() {
  if (!this.frames.length) return;
  // if (this.preloadAll) { /* ... */ return; }

  const win = this._getWindowIndices();
  console.log("win size", win)
  // const boundFrontId = this._resolveAssetId(this.front.gsplat.asset);
  // const boundBackId  = this._resolveAssetId(this.back.gsplat.asset);
  const boundFrontId = this.front.gsplat.asset || null;
  const boundBackId  = this.back.gsplat.asset  || null;
  console.log("inflight size", this.inflight.size)
  for (let idx = 0; idx < this.frames.length; idx++) {
    const asset = this.frames[idx];
    if (!asset) continue;

    if (win.has(idx)) {
      if (!asset.resource) {
        this.inflight.add(asset);
        setTimeout( () => {
          asset.ready(() => { this.inflight.delete(asset); });

        },100) 
        this.app.assets.load(asset);
      }
    } else {
      // don't unload if it's currently bound by id or in the trim batch or inflight
      const aid = (typeof asset.id === 'number') ? asset.id : null;
      const isBound = aid !== null && (aid === boundFrontId || aid === boundBackId);
      if (asset.resource && asset.loaded && !this.inflight.has(asset) && !isBound ) {
        try { asset.unload(); } catch (e) { console.warn('unload failed', e); }
      }
    }
  }
}
// Helper: check if asset is in the oldest batch to be trimmed
_isInTrimBatch(asset) {
  if (!this.autoTrimBatchSize || this.autoTrimBatchSize <= 0) return false;
  if (!this.frames || this.frames.length === 0) return false;

  const trimCount = Math.min(this.autoTrimBatchSize, this.frames.length);
  for (let i = 0; i < trimCount; i++) {
    if (this.frames[i] === asset) return true;
  }
  return false;
}
  _prepNext(idx) {
    if (!this.frames.length) return;
    this.nextIndex = idx;
    const asset = this.frames[idx];
    console.log("index prep",  this.nextIndex)

    // clear back buffer if it holds a different asset (and unload it)
    if (this.back.gsplat.asset && this.back.gsplat.asset !== asset) {
      const a = this.back.gsplat.asset;
      this.back.gsplat.asset = null;
      if (a.resource) a.unload();
    }

    // assign new "next" asset to back (flip only when resource is ready)
    this.back.gsplat.asset = asset;

    if (asset && !asset.resource) {
      this.inflight.add(asset);
      asset.ready(() => { this.inflight.delete(asset); });
      this.app.assets.load(asset);
    }

    // maintain window (load further ahead, unload old)
    this._maintainWindow();
  }

  update(dt) {
    if (!this.frames || this.frames.length === 0 || this.fps <= 0) return;

    const dur = 1 / Math.max(1, this.fps);
    this.accum += dt;
    if (this.accum < dur) return;
    this.accum -= dur;

    // If nextIndex not set (could happen if we appended but didn't call _prepNext), try to set it
    // if (this.nextIndex == null || this.nextIndex === undefined) {
    //   let nn = this.i + 1;
    //   if (nn >= this.frames.length) {
    //     if (this.loop) nn = 0; else return;
    //   }
    //   this._prepNext(nn);
    // }
    // console.log("length", this.frames.length)

    const asset = this.frames[this.nextIndex];
    // console.log("index update",  this.nextIndex)

    // Flip only if the next frame is ready
    if (asset && asset.resource  ) {
      // show back, hide front
      this.back.gsplat.show();
      this.front.gsplat.hide();

      // swap roles
      const tmp = this.front; this.front = this.back; this.back = tmp;

      // cleanup old asset on the now-back buffer
      const oldAsset = this.back.gsplat.asset;
      if (oldAsset) {
        this.back.gsplat.asset = null;
        setTimeout(() => {
          if (oldAsset.resource && oldAsset.loaded && !this.inflight.has(oldAsset)) {
            try { oldAsset.unload(); } catch (e) { /* ignore */ }  //oldAsset.unload();
          }
        }, 0);
      }

      // advance index and prepare one after next
      this.i = this.nextIndex;
      let nn = this.i + 1;
      if (nn >= this.frames.length) {
        if (this.loop) nn = 0; else {
          // no more frames and not looping -> stop updating further
          return;
        }
      }

      // window maintenance + prep next
      this._maintainWindow();
      this._prepNext(nn);
    } else {
      // Next not ready; stay on current frame.
    }
  //   if (this._pendingTrim && this._pendingTrim > 0) {
  //   this._tryTrimPending();
  //  }

  //   if (this._deferredRemovals && this._deferredRemovals.length) {
  //     const now = Date.now();
  //     const keep = [];
  //     for (const item of this._deferredRemovals) {
  //       if (now - item.time > 80) { // 80ms delay
  //         const a = item.asset;
  //         try {
  //           if (a._blobUrl) { URL.revokeObjectURL(a._blobUrl); a._blobUrl = null; }
  //           if (a.resource && a.loaded) a.unload();
  //           if (this.app && this.app.assets && typeof this.app.assets.remove === 'function') this.app.assets.remove(a);
  //         } catch (e) { console.warn('deferred remove failed', e); }
  //       } else keep.push(item);
  //     }
  //     this._deferredRemovals = keep;
  //   }
   }
}