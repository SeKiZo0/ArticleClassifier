import React, { useState, useMemo } from 'react';

const ArticleView = ({ data }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterText, setFilterText] = useState('');

  // Flatten data into article-based format
  const articleData = useMemo(() => {
    if (!data || !data.themes) return [];
    
    const articlesMap = new Map();
    
    data.themes.forEach(theme => {
      theme.subthemes.forEach(subtheme => {
        // Get all reference numbers for this subtheme
        subtheme.references.forEach(refNumber => {
          if (!articlesMap.has(refNumber)) {
            articlesMap.set(refNumber, {
              articleReference: refNumber,
              codes: [],
              themes: new Set(),
              subthemes: new Set(),
              quotes: []
            });
          }
          
          const article = articlesMap.get(refNumber);
          article.themes.add(theme.name);
          article.subthemes.add(subtheme.name);
          
          // Add codes for this subtheme
          if (subtheme.codes && subtheme.codes.length > 0) {
            subtheme.codes.forEach(code => {
              article.codes.push(code.name);
              if (code.quotes && code.quotes.length > 0) {
                article.quotes.push(...code.quotes);
              }
            });
          }
        });
      });
    });
    
    // Convert to array and clean up
    return Array.from(articlesMap.values()).map(article => ({
      articleReference: article.articleReference,
      codes: [...new Set(article.codes)], // Remove duplicates
      themes: Array.from(article.themes),
      subthemes: Array.from(article.subthemes),
      quotes: [...new Set(article.quotes.filter(q => q && q.trim()))] // Remove duplicates and empty quotes
    }));
  }, [data]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!filterText) return articleData;
    
    return articleData.filter(article =>
      article.articleReference.toString().includes(filterText) ||
      article.codes.some(code => code.toLowerCase().includes(filterText.toLowerCase())) ||
      article.themes.some(theme => theme.toLowerCase().includes(filterText.toLowerCase())) ||
      article.subthemes.some(subtheme => subtheme.toLowerCase().includes(filterText.toLowerCase())) ||
      article.quotes.some(quote => quote.toLowerCase().includes(filterText.toLowerCase()))
    );
  }, [articleData, filterText]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle array fields
      if (Array.isArray(aValue)) aValue = aValue.join(', ');
      if (Array.isArray(bValue)) bValue = bValue.join(', ');

      // Handle numeric fields
      if (sortConfig.key === 'articleReference') {
        aValue = parseInt(aValue);
        bValue = parseInt(bValue);
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredData, sortConfig]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return ' ↕️';
    }
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  if (!data || !data.themes) {
    return <div>No data available</div>;
  }

  return (
    <div className="table-view">
      <div className="table-header">
        <h2>ARTICLE-BASED FINDINGS</h2>
        <div className="table-controls">
          <input
            type="text"
            placeholder="Filter by article, code, theme, subtheme, or quote..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="table-filter-input"
          />
          <div className="table-summary">
            Showing {sortedData.length} of {articleData.length} articles
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table article-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('articleReference')} className="sortable">
                Article Reference{getSortIcon('articleReference')}
              </th>
              <th onClick={() => handleSort('quotes')} className="sortable">
                Quote{getSortIcon('quotes')}
              </th>
              <th onClick={() => handleSort('codes')} className="sortable">
                Code{getSortIcon('codes')}
              </th>
              <th onClick={() => handleSort('themes')} className="sortable">
                Theme{getSortIcon('themes')}
              </th>
              <th onClick={() => handleSort('subthemes')} className="sortable">
                Subtheme{getSortIcon('subthemes')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((article, index) => (
              <tr key={article.articleReference} className={index % 2 === 0 ? 'even-row' : 'odd-row'}>
                <td className="article-ref-cell">
                  <span className="article-reference">[{article.articleReference}]</span>
                </td>
                <td className="quote-cell">
                  <div className="quotes-container">
                    {article.quotes.length > 0 ? (
                      article.quotes.map((quote, idx) => (
                        <div key={idx} className="quote-item">
                          "{quote}"
                        </div>
                      ))
                    ) : (
                      <span className="no-quotes">No quotes available</span>
                    )}
                  </div>
                </td>
                <td className="codes-cell">
                  <div className="codes-container">
                    {article.codes.map((code, idx) => (
                      <span key={idx} className="code-tag-article">
                        {code}{idx < article.codes.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="themes-cell">
                  <div className="themes-container">
                    {article.themes.map((theme, idx) => (
                      <div key={idx} className="theme-item-article">
                        {theme}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="subthemes-cell">
                  <div className="subthemes-container">
                    {article.subthemes.map((subtheme, idx) => (
                      <div key={idx} className="subtheme-item-article">
                        {subtheme}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedData.length === 0 && filterText && (
        <div className="no-results">
          No results found for "{filterText}"
        </div>
      )}
    </div>
  );
};

export default ArticleView;
