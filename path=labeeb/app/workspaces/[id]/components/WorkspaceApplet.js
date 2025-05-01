value={htmlVersions[activeVersionIndex]} 

<textarea
  className="w-full h-full overflow-auto p-4 bg-gray-50 rounded-md font-mono text-sm resize-none focus:outline-none"
  value={htmlVersions[activeVersionIndex]}
  onChange={(e) => {
    const newVersions = [...htmlVersions];
    newVersions[activeVersionIndex] = e.target.value;
    setHtmlVersions(newVersions);
    setPreviewHtml(e.target.value);
  }}
/> 