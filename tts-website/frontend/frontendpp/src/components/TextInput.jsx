import React from 'react';

function TextInput({ text, setText }) {
  return (
    <div className="textarea-wrap">
      <textarea
        id="text-input"
        placeholder="Paste or type your text here..."
        rows="8"
        maxLength="5000"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <span className="char-count">
        <span>{text.length}</span> / 5000
      </span>
    </div>
  );
}

export default TextInput;