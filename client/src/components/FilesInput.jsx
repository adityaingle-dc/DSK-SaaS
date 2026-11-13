import { useEffect, useRef, useState } from 'react';
import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES, MAX_FILES } from '@dsk/shared';
import { api } from '../api/client.js';

const MAX_DIMENSION = 2400; // px – plenty for reading a deed, keeps phone photos ~0.5–1.5 MB

// Downscale large JPEG/PNG/WEBP photos before upload (phone cameras produce 4–12 MB images)
async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // browser can't decode it – upload as is
  }
}

const sizeText = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function FileThumb({ file, onRemove }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const isImage = file.type?.startsWith('image/') && !/hei[cf]/.test(file.type);

  useEffect(() => {
    let live = true;
    if (isImage) api.fileUrl(file.id).then((u) => live && setUrl(u)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file.id, isImage]);

  const open = async () => {
    const w = window.open('', '_blank');
    try {
      w.location.href = await api.fileUrl(file.id);
    } catch (e) {
      w?.close();
      alert(e.message);
    }
  };

  return (
    <div className="thumb" title={`${file.name} · ${sizeText(file.size)}`}>
      <button type="button" className="thumb-body" onClick={open}>
        {isImage && url ? <img src={url} alt={file.name} /> : <span className="thumb-icon">{failed ? '⚠' : file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>}
      </button>
      <span className="thumb-name">{file.name}</span>
      {onRemove && (
        <button type="button" className="thumb-remove" aria-label={`Remove ${file.name}`} onClick={onRemove}>✕</button>
      )}
    </div>
  );
}

export default function FilesInput({ value = [], onChange, accept = 'image/*,application/pdf' }) {
  const pickRef = useRef(null);
  const cameraRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const latest = useRef(value);
  latest.current = value;

  const addFiles = async (fileList) => {
    setError('');
    const files = [...fileList];
    const room = MAX_FILES - latest.current.length;
    if (files.length > room) setError(`Up to ${MAX_FILES} files per document.`);
    for (const original of files.slice(0, Math.max(room, 0))) {
      if (original.type && !ALLOWED_FILE_TYPES.includes(original.type)) {
        setError(`${original.name}: only images (JPG, PNG, WEBP, HEIC) or PDF.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const file = await compressImage(original);
        if (file.size > MAX_FILE_BYTES) throw new Error(`${original.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
        const ref = await api.uploadFile(file);
        onChange([...latest.current, ref]);
        latest.current = [...latest.current, ref];
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remove = (id) => {
    onChange(value.filter((f) => f.id !== id));
    api.deleteFile(id).catch(() => {}); // succeeds only for files not yet saved on a valuation
  };

  return (
    <div className="files-input">
      <div className="thumbs">
        {value.map((f) => <FileThumb key={f.id} file={f} onRemove={() => remove(f.id)} />)}
        {uploading > 0 && <div className="thumb uploading"><span className="thumb-icon">…</span><span className="thumb-name">Uploading</span></div>}
      </div>
      <div className="files-actions">
        <button type="button" className="btn small" onClick={() => pickRef.current?.click()}>+ Upload</button>
        <button type="button" className="btn small camera-btn" onClick={() => cameraRef.current?.click()}>Camera</button>
      </div>
      <input ref={pickRef} type="file" accept={accept} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
