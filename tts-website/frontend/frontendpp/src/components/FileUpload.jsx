import React, { useRef } from 'react';

function FileUpload({ file, setFile, fileInputRef }) {
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    setFile(selected || null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      // Update the input's files property
      const input = fileInputRef.current;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(dropped);
        input.files = dt.files;
      }
    }
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleClick = () => fileInputRef.current?.click();

  return (
    <>
      <div
        className="file-drop"
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <svg className="file-drop-icon" width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m0-12l4 4m-4-4L8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span id="file-name">
          {file ? file.name : 'Drop a file here, or <u>click to browse</u>'}
        </span>
        <span className="file-drop-hint">Supports .txt · .srt · .vtt</span>
      </div>
      <input
        type="file"
        id="file-input"
        accept=".txt,.srt,.vtt"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </>
  );
}

export default FileUpload;