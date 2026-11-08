// @ts-check
export const READER_SYNCHRONIZATION_SCHEMA = 'kamu.reader-synchronization.v1';
/** @typedef {{cue_id:string,token_ids:string[],start:number,end:number}} Cue */
/** @typedef {{identity:Record<string,string>,displayText:{path:string,sha256:string,sourceSha256:string},audioId:string,durationSeconds:number,wordIds:string[]}} SynchronizationContext */
const IDENTIFIER=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEYS=['schema','readerAuthority','displayText','durationSeconds','synchronization_id','text_id','audio_id','time_unit','cues'];

/** @param {unknown} value @param {string[]} keys @param {string} subject @returns {Record<string,any>} */
function closed(value,keys,subject) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==keys.length
    || keys.some((key)=>!Object.hasOwn(value,key))) throw new Error(`${subject} fields differ`);
  return /** @type {Record<string,any>} */ (value);
}

class ReaderSynchronization {
  /** @type {ReadonlyArray<Readonly<Cue>>} */ #cues;
  /** @type {Map<string,number>} */ #indices;
  /** @param {Cue[]} cues */
  constructor(cues) {
    this.#cues=Object.freeze(cues.map((cue)=>Object.freeze({...cue,token_ids:Object.freeze([...cue.token_ids])})));
    this.#indices=new Map(cues.flatMap((cue,index)=>cue.token_ids.map((id)=>[id,index])));
    Object.freeze(this);
  }
  get cueCount() { return this.#cues.length; }
  /** @param {string} tokenId */
  indexForToken(tokenId) {
    const index=this.#indices.get(tokenId);
    if (index===undefined) throw new Error('Read public reader synchronization: supplied word identity is absent');
    return index;
  }
  /** Cue intervals include their start and exclude their end.
   * @param {number} time
   */
  activeIndex(time) {
    let low=0,high=this.#cues.length-1,best=-1;
    while (low<=high) {
      const middle=Math.floor((low+high)/2);
      if (time<this.#cues[middle].start) high=middle-1;
      else {best=middle;low=middle+1;}
    }
    return best>=0 && time<this.#cues[best].end ? best : -1;
  }
}

/** Validate the fetched publication payload at the browser boundary.
 * @param {unknown} input @param {SynchronizationContext} context
 */
export function parseReaderSynchronization(input,context) {
  try {
    const sync=closed(input,KEYS,'synchronization');
    const identity=closed(sync.readerAuthority,Object.keys(context.identity),'reader identity');
    const display=closed(sync.displayText,['path','sha256','sourceSha256'],'display reference');
    if (sync.schema!==READER_SYNCHRONIZATION_SCHEMA || sync.time_unit!=='seconds'
      || !IDENTIFIER.test(sync.synchronization_id) || sync.text_id!==context.identity.text_id
      || sync.audio_id!==context.audioId || sync.durationSeconds!==context.durationSeconds
      || !Number.isFinite(sync.durationSeconds) || sync.durationSeconds<=0
      || Object.keys(context.identity).some((key)=>identity[key]!==context.identity[key])
      || Object.keys(context.displayText).some((key)=>display[key]!==context.displayText[key])) throw new Error('publication identity differs');
    if (!Array.isArray(sync.cues) || sync.cues.length===0) throw new Error('cue authority is absent');
    const ids=new Set(); let word=0,previousEnd=0;
    for (const inputCue of sync.cues) {
      const cue=closed(inputCue,['cue_id','token_ids','start','end'],'cue');
      if (typeof cue.cue_id!=='string' || !IDENTIFIER.test(cue.cue_id) || ids.has(cue.cue_id)
        || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start<previousEnd
        || cue.end<=cue.start || cue.end>sync.durationSeconds
        || !Array.isArray(cue.token_ids) || cue.token_ids.length===0) throw new Error('cue identity or interval differs');
      ids.add(cue.cue_id); previousEnd=cue.end;
      for (const tokenId of cue.token_ids) {
        if (word>=context.wordIds.length || tokenId!==context.wordIds[word]) throw new Error('cue word membership differs');
        word+=1;
      }
    }
    if (word!==context.wordIds.length) throw new Error('cues omit supplied words');
    return new ReaderSynchronization(sync.cues);
  } catch(error) {
    throw new Error(`Read public reader synchronization: ${error instanceof Error?error.message:String(error)}`,{cause:error});
  }
}
