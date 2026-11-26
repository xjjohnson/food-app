/**
 * Photos on a record (a batch, a delivery, a product): saved in Odoo as attachments, so
 * they show in Odoo on the record too. The picture waits as a file on the phone and goes
 * through the offline queue as a `photo` step. Sent twice it is saved once, because every
 * photo has its own file name.
 *
 * Kept free of React; the client is passed in.
 */
import { dropPhoto, readPhoto } from './photoFiles';
import type { NewChange } from './queue';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface Photo {
  id: number;
  name: string;
  when: string;
  /** What the photo is about, from its file name ("Delivery proof"). */
  about: string;
  /** Picture as base64 text, for showing it. */
  data: string;
}

/** What a photo is for. The word goes in the file name so the timeline can say it. */
export const PHOTO_KINDS = ['Photo', 'Delivery proof', 'Batch photo', 'Receipt'] as const;

export function photoChange(model: string, resId: number, about: string, uri: string, recordName: string, now = Date.now()): NewChange {
  const name = `${about} ${new Date(now).toISOString().slice(0, 19).replace('T', ' ')} ${now.toString(36)}.jpg`;
  return {
    label: `${about} on ${recordName}`,
    model,
    method: 'message_post',
    args: [],
    step: { kind: 'photo', model, resId, name, uri },
  };
}

/** Puts the saved picture on the record as an attachment, once. A missing file with no copy in Odoo is an error. */
export async function runPhoto(c: Client, s: { model: string; resId: number; name: string; uri: string }): Promise<void> {
  const have = (await c.call('ir.attachment', 'search', [[['res_model', '=', s.model], ['res_id', '=', s.resId], ['name', '=', s.name]]], { limit: 1 })) as number[];
  if (have.length) {
    await dropPhoto(s.uri);
    return;
  }
  const data = await readPhoto(s.uri);
  if (!data) throw new Error('The photo file is no longer on this phone, so it could not be sent. Take it again.');
  await c.call('ir.attachment', 'create', [{ name: s.name, res_model: s.model, res_id: s.resId, type: 'binary', mimetype: 'image/jpeg', datas: data }], {});
  await dropPhoto(s.uri);
}

const aboutOf = (name: string) => PHOTO_KINDS.find((k) => name.startsWith(k)) ?? 'Photo';

/** The record's photos, newest first (at most 12, to keep it light). */
export async function loadPhotos(c: Client, model: string, resId: number): Promise<Photo[]> {
  const rows = (await c.call('ir.attachment', 'search_read', [[['res_model', '=', model], ['res_id', '=', resId], ['mimetype', 'like', 'image/']]], { fields: ['name', 'create_date', 'datas'], order: 'id desc', limit: 12 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: String(r.name), when: typeof r.create_date === 'string' ? r.create_date.slice(0, 16) : '', about: aboutOf(String(r.name)), data: typeof r.datas === 'string' ? r.datas : '' }));
}
