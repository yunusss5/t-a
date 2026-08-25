import React, { useEffect, useRef } from 'react';

function Tabs({ activeTab, setActiveTab }) {
  const indicatorRef = useRef(null);
  const tabRefs = useRef([]);

  useEffect(() => {
    // Update indicator position
    const activeIndex = ['text-tab', 'file-tab'].indexOf(activeTab);
    if (indicatorRef.current && tabRefs.current[activeIndex]) {
      const btn = tabRefs.current[activeIndex];
      // Vite's CSS may need adjustment – we'll just use translateX
      indicatorRef.current.style.transform = `translateX(${activeIndex * 100}%)`;
    }
  }, [activeTab]);

  const handleTabClick = (tabId, index) => {
    setActiveTab(tabId);
  };

  return (
    <div className="tabs">
      <button
        ref={el => tabRefs.current[0] = el}
        className={`tab-btn ${activeTab === 'text-tab' ? 'active' : ''}`}
        onClick={() => handleTabClick('text-tab', 0)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Paste Text
      </button>
      <button
        ref={el => tabRefs.current[1] = el}
        className={`tab-btn ${activeTab === 'file-tab' ? 'active' : ''}`}
        onClick={() => handleTabClick('file-tab', 1)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m0-12l4 4m-4-4L8 7M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Upload Transcript
      </button>
      <span className="tab-indicator" ref={indicatorRef}></span>
    </div>
  );
}

export default Tabs;