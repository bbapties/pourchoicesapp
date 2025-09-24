export function SearchScreen({ bottles, currentSearchResults, setCurrentSearchResults, currentFilters, setCurrentFilters, currentSort, setCurrentSort, showToast, userCollection, setUserCollection, currentUser }) {
  // Placeholder - we'll implement later
  return (
    <div id="search-screen" className="screen active">
      <div className="search-header">
        <h1>Search Database</h1>
        <div className="search-controls">
          <div className="search-bar">
            <input type="text" placeholder="Search whiskies..." disabled />
            <button className="search-icon">🔍</button>
          </div>
        </div>
      </div>
      <div className="search-results">
        <div style={{ padding: '20px', textAlign: 'center' }}>
          Search functionality coming soon...<br />
          Sample bottles: {bottles.length}
        </div>
      </div>
    </div>
  )
}
