export function ComingSoonScreen({ setCurrentScreen }) {
  return (
    <div id="coming-soon-screen" className="screen active">
      <div className="coming-soon-content">
        <div className="barrel-poster">
          <img src="frontend/assets/coming-soon.jpg" alt="Coming Soon" className="coming-soon-image" />
        </div>
        <button className="btn btn-primary" onClick={() => setCurrentScreen('search')}>Back</button>
      </div>
    </div>
  )
}
