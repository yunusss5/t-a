// src/tools/ImageStudio.jsx
// Resize, compress and convert images with a canvas — the file never leaves the
// browser, which also means no upload limit.

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Image as ImageIcon, Wand2 } from 'lucide-react';
import { downloadBlob, formatBytes } from '../lib/utils';
import {
  Button, Checkbox, ErrorNote, Field, Input, Panel, Range, Segmented, ToolGrid,
} from '../components/ui/Primitives';
import { Dropzone, EmptyState, Stat, StatRow } from '../components/ui/Display';

const FORMATS = [
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/png', label: 'PNG' },
];

const EXTENSION = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export default function ImageStudio() {
  const [file, setFile] = useState(null);
  const [source, setSource] = useState(null); // { url, width, height }
  const [format, setFormat] = useState('image/webp');
  const [quality, setQuality] = useState(82);
  const [width, setWidth] = useState('');
  const [lockRatio, setLockRatio] = useState(true);
  const [height, setHeight] = useState('');
  const [result, setResult] = useState(null); // { url, blob }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const imageRef = useRef(null);

  // Load the picked file into an <img> so we know its natural dimensions.
  useEffect(() => {
    if (!file) return undefined;

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      imageRef.current = image;
      setSource({ url, width: image.naturalWidth, height: image.naturalHeight });
      setWidth(String(image.naturalWidth));
      setHeight(String(image.naturalHeight));
      setResult(null);
      setError('');
    };

    image.onerror = () => setError('That file could not be read as an image.');
    image.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onWidthChange = (value) => {
    setWidth(value);
    if (lockRatio && source && value) {
      setHeight(String(Math.max(1, Math.round((Number(value) / source.width) * source.height))));
    }
  };

  const onHeightChange = (value) => {
    setHeight(value);
    if (lockRatio && source && value) {
      setWidth(String(Math.max(1, Math.round((Number(value) / source.height) * source.width))));
    }
  };

  const process = () => {
    const image = imageRef.current;
    if (!image) return;

    setBusy(true);
    setError('');

    const targetWidth = Math.max(1, Number(width) || image.naturalWidth);
    const targetHeight = Math.max(1, Number(height) || image.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    // JPEG has no alpha channel — fill white so transparency doesn't turn black.
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        setBusy(false);

        if (!blob) {
          setError('The browser could not encode that format. Try PNG.');
          return;
        }

        if (result?.url) URL.revokeObjectURL(result.url);
        setResult({ blob, url: URL.createObjectURL(blob), width: targetWidth, height: targetHeight });
        toast.success('Image processed');
      },
      format,
      format === 'image/png' ? undefined : quality / 100,
    );
  };

  const saving = result && file ? Math.round((1 - result.blob.size / file.size) * 100) : 0;

  return (
    <ToolGrid>
      <div className="stack">
        <Panel title="Source image" hint="PNG, JPG, WebP, GIF or SVG — processed locally.">
          <Dropzone file={file} onFile={setFile} accept="image/*" hint="Any image your browser can open" />
          {source && (
            <StatRow>
              <Stat label="Width" value={source.width} />
              <Stat label="Height" value={source.height} />
              <Stat label="Size" value={formatBytes(file.size)} />
            </StatRow>
          )}
          <ErrorNote>{error}</ErrorNote>
        </Panel>

        {source && (
          <Panel title="Settings">
            <Field label="Output format">
              <Segmented value={format} onChange={setFormat} options={FORMATS} size="sm" label="Output format" />
            </Field>

            <div className="field-row">
              <Field label="Width (px)">
                <Input value={width} onChange={onWidthChange} type="number" min="1" />
              </Field>
              <Field label="Height (px)">
                <Input value={height} onChange={onHeightChange} type="number" min="1" />
              </Field>
            </div>

            <Checkbox checked={lockRatio} onChange={setLockRatio} label="Keep aspect ratio" />

            {format !== 'image/png' && (
              <Field label="Quality" hint={`${quality}%`}>
                <Range value={quality} onChange={setQuality} min={30} max={100} suffix="%" />
              </Field>
            )}

            <div className="btn-row">
              <Button icon={<Wand2 size={16} />} loading={busy} onClick={process}>
                Process image
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setWidth(String(source.width));
                  setHeight(String(source.height));
                }}
              >
                Reset size
              </Button>
            </div>
          </Panel>
        )}
      </div>

      <Panel
        title="Result"
        hint={result ? `${result.width}×${result.height}` : 'Nothing processed yet'}
        actions={
          result && (
            <Button
              variant="ghost"
              icon={<Download size={15} />}
              onClick={() =>
                downloadBlob(
                  `${(file.name || 'image').replace(/\.[^.]+$/, '')}-${result.width}px.${EXTENSION[format]}`,
                  result.blob,
                )
              }
            >
              Download
            </Button>
          )
        }
      >
        {result ? (
          <>
            <div className="media-preview">
              <img src={result.url} alt="Processed result" />
            </div>
            <StatRow>
              <Stat label="New size" value={formatBytes(result.blob.size)} />
              <Stat
                label="Saved"
                value={`${saving > 0 ? saving : 0}%`}
                tone={saving > 0 ? 'good' : 'warn'}
              />
              <Stat label="Format" value={EXTENSION[format].toUpperCase()} />
            </StatRow>
            {saving <= 0 && (
              <p className="inline-note">
                The output got bigger. Lower the quality, reduce the width, or try WebP.
              </p>
            )}
          </>
        ) : (
          <EmptyState icon={<ImageIcon size={26} />} title="Your processed image lands here">
            WebP at 80% quality typically cuts a photo to a quarter of its JPG size with no visible
            difference — ideal for thumbnails and blog headers.
          </EmptyState>
        )}
      </Panel>
    </ToolGrid>
  );
}
