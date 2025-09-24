export function MyBarScreen({ userCollection, setUserCollection, bottles, showToast, currentUser }) {
  return (
    <div id="mybar-screen" className="screen active">
      <div className="mybar-header">
        <h1>My Bar</h1>
        <div className="bar-count">{userCollection.length} Bottles</div>
      </div>
      <div className="mybar-results">
        <div style={{ padding: '20px', textAlign: 'center' }}>
          My Bar functionality coming soon...
        </div>
      </div>
    </div>
  )
}
