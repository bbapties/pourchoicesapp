import { useState, useEffect } from 'react'

export function SearchScreen({ bottles, currentSearchResults, setCurrentSearchResults, currentFilters, setCurrentFilters, currentSort, setCurrentSort, showToast, userCollection, setUserCollection, currentUser, openDetailsModal, openAddModal }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Cache for search results
  const [searchCache, setSearchCache] = useState({})

  useEffect(() => {
    // Load search cache from localStorage
    const savedCache = localStorage.getItem('pourChoicesSearchCache')
    if (savedCache) {
      try {
        setSearchCache(JSON.parse(savedCache))
      } catch (e) {
        console.error('Error loading search cache:', e)
      }
    }

    // Load all bottles initially
    if (bottles.length > 0 && !hasSearched) {
      performSearch('', 1)
    }
  }, [bottles, hasSearched])

  const saveCacheToStorage = (cache) => {
    try {
      // Keep only last 10 searches with their results
      const cacheEntries = Object.entries(cache)
      const recentEntries = cacheEntries
        .sort(([,aResults], [,bResults]) =>
          (bResults.timestamp || 0) - (aResults.timestamp || 0)
        )
        .slice(0, 10)

      const trimmedCache = Object.fromEntries(recentEntries)
      localStorage.setItem('pourChoicesSearchCache', JSON.stringify(trimmedCache))
    } catch (e) {
      console.error('Error saving search cache:', e)
    }
  }

  const performSearch = async (query, pageNum = 1) => {
    // Allow empty query for initial load

    setIsLoading(true)
    const cacheKey = `${query}-${pageNum}`

    if (searchCache[cacheKey]) {
      setCurrentSearchResults(searchCache[cacheKey])
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/spirits/search?query=${encodeURIComponent(query)}&page=${pageNum}`)
      if (!response.ok) {
        throw new Error('Search failed')
      }
      const data = await response.json()

      const timestamp = Date.now()
      setCurrentSearchResults(data.results || [])
      setSearchCache(prev => {
        const newCache = { ...prev, [cacheKey]: { results: data.results || [], timestamp } }
        saveCacheToStorage(newCache)
        return newCache
      })

      // Analytics
      console.log('PourChoices-Event', {
        timestamp: new Date().toISOString(),
        user_id: currentUser?.id || 'anonymous',
        screen: 'search',
        action: 'query',
        query,
        status: data.results.length > 0 ? 'success' : 'no_results'
      })

    } catch (error) {
      console.error('Search error:', error)
      showToast('Cellar signal lost—retry', 'error')

      // Fallback to cached results
      const cachedResults = Object.values(searchCache).flat().filter(b =>
        b.name.toLowerCase().includes(query.toLowerCase()) ||
        b.distillery.toLowerCase().includes(query.toLowerCase()) ||
        b.type.toLowerCase().includes(query.toLowerCase())
      )
      setCurrentSearchResults(cachedResults.slice(0, 20))

      // Analytics
      console.log('PourChoices-Event', {
        timestamp: new Date().toISOString(),
        user_id: currentUser?.id || 'anonymous',
        screen: 'search',
        action: 'network_fail',
        query
      })
    } finally {
      setIsLoading(false)
      setHasSearched(true)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    performSearch(searchQuery, 1)
  }

  const loadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    performSearch(searchQuery, nextPage)
  }

 
  const renderResults = () => {
    if (!hasSearched) return null

    if (currentSearchResults.length === 0) {
      return (
        <div className="no-results">
          <div className="empty-glass">🥂</div>
          <p>Oops, add yours?</p>
          <button
            className="btn primary"
            onClick={openAddModal}
          >
            Add Bottle
          </button>
        </div>
      )
    }

    return (
      <div className="search-results">
        {currentSearchResults.map((bottle, index) => (
          <div
            key={bottle.id || index}
            className="slim-card"
            style={{ animationDelay: `${index * 0.1}s` }}
            onClick={() => openDetailsModal(bottle)}
            role="button"
            tabIndex={0}
            aria-label={`View details for ${bottle.name}`}
          >
            <div className="slim-card-thumbnail">
              {bottle.images?.length > 0 ? (
                <img src={bottle.images[0]} alt={bottle.name} />
              ) : (
                bottle.emoji
              )}
            </div>
            <div className="slim-card-content">
              <div className="slim-card-name">{bottle.name} {bottle.status === 'pending' ? '⏳' : ''}</div>
              <div className="slim-card-distillery">{bottle.distillery}</div>
              <div className="slim-card-type">{bottle.type}</div>
            </div>
          </div>
        ))}

        {currentSearchResults.length >= 20 && (
          <button
            className="btn secondary"
            onClick={loadMore}
            disabled={isLoading}
            style={{ margin: '20px auto', display: 'block' }}
          >
            {isLoading ? 'Loading...' : 'Pour 20 More?'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div id="search-screen" className="screen active">
      <div className="search-header">
        <div className="search-controls">
          <form onSubmit={handleSearch} className="search-bar">
            <input
              type="text"
              placeholder="e.g., Glenfiddich 12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search bar"
            />
            <button type="submit" className="search-icon" disabled={isLoading}>
              🔍
            </button>
          </form>
        </div>
      </div>

      <div className="search-body">
        {renderResults()}
      </div>

      {isLoading && (
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  )
}
