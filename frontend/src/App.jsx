import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <div className="uppercase tracking-wide text-sm text-indigo-500 font-semibold">
            Welcome to Pour Choices
          </div>
          <h1 className="block mt-1 text-lg leading-tight font-medium text-black">
            Whisky Tasting App
          </h1>
          <p className="mt-2 text-gray-500">
            Your personal whisky collection and tasting companion.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCount((count) => count + 1)}
              className="bg-amber-500 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded"
            >
              Bottles: {count}
            </button>
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Start Tasting
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-400">
            <p>The backend is running on port 3001</p>
            <p>Connected to Supabase database</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
