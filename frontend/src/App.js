import React, { useState, useEffect } from 'react';
import ThematicAnalysis from './components/ThematicAnalysis';
import TableView from './components/TableView';
import ArticleView from './components/ArticleView';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('thematic');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/thematic-analysis');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = data && searchTerm ? {
    ...data,
    themes: data.themes.filter(theme => 
      theme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      theme.subthemes.some(subtheme => 
        subtheme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        subtheme.codes.some(code => 
          code.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    )
  } : data;

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading GitHub Copilot tactics analysis...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          <h3>Error loading data</h3>
          <p>{error}</p>
          <button onClick={fetchData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>GitHub Copilot Tactics Analysis</h1>
        <p>Thematic analysis of tactics and methods to improve software development efficiency</p>
      </div>

      {data && (
        <>
          <div className="summary-stats">
            <div className="stat-card">
              <div className="stat-number">{data.summary.totalPapers}</div>
              <div className="stat-label">Research Papers</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{data.summary.totalThemes}</div>
              <div className="stat-label">Themes</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{data.summary.totalSubthemes}</div>
              <div className="stat-label">Sub-themes</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{data.summary.totalCodes}</div>
              <div className="stat-label">Tactics & Methods</div>
            </div>
          </div>

          <div className="search-section">
            <input
              type="text"
              placeholder="Search themes, sub-themes, or tactics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="nav-tabs">
            <button 
              className={`nav-tab ${activeTab === 'thematic' ? 'active' : ''}`}
              onClick={() => setActiveTab('thematic')}
            >
              Thematic Analysis View
            </button>
            <button 
              className={`nav-tab ${activeTab === 'table' ? 'active' : ''}`}
              onClick={() => setActiveTab('table')}
            >
              Table View
            </button>
            <button 
              className={`nav-tab ${activeTab === 'article' ? 'active' : ''}`}
              onClick={() => setActiveTab('article')}
            >
              Article View
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'thematic' && <ThematicAnalysis data={filteredData} />}
            {activeTab === 'table' && <TableView data={filteredData} />}
            {activeTab === 'article' && <ArticleView data={filteredData} />}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
