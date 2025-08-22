import React, { useState, useMemo } from 'react';

const TableView = ({ data }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterText, setFilterText] = useState('');

  // Flatten the data into a table format
  const tableData = useMemo(() => {
    if (!data || !data.themes) return [];
    
    const rows = [];
    data.themes.forEach(theme => {
      // Add theme header row
      rows.push({
        type: 'theme',
        theme: theme.name,
        subtheme: '',
        codes: '',
        references: [],
        themeDescription: theme.description,
        isThemeRow: true
      });

      // Add subtheme rows
      theme.subthemes.forEach(subtheme => {
        // Concatenate all codes for this subtheme
        const allCodes = subtheme.codes && subtheme.codes.length > 0 
          ? subtheme.codes.map(code => `"${code.name}"`).join(', ')
          : '';

        rows.push({
          type: 'subtheme',
          theme: theme.name,
          subtheme: subtheme.name,
          codes: allCodes,
          references: subtheme.references || [],
          subthemeDescription: subtheme.description,
          isThemeRow: false
        });
      });
    });
    return rows;
  }, [data]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!filterText) return tableData;
    
    return tableData.filter(row =>
      row.theme.toLowerCase().includes(filterText.toLowerCase()) ||
      row.subtheme.toLowerCase().includes(filterText.toLowerCase()) ||
      row.codes.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [tableData, filterText]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

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
        <h2>FINDINGS</h2>
        <div className="table-controls">
          <input
            type="text"
            placeholder="Filter by theme, sub-theme, or code..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="table-filter-input"
          />
          <div className="table-summary">
            Showing {sortedData.length} of {tableData.length} entries
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table findings-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('theme')} className="sortable">
                Theme{getSortIcon('theme')}
              </th>
              <th onClick={() => handleSort('subtheme')} className="sortable">
                Sub-theme{getSortIcon('subtheme')}
              </th>
              <th onClick={() => handleSort('codes')} className="sortable">
                Codes{getSortIcon('codes')}
              </th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, index) => (
              <tr key={index} className={`${index % 2 === 0 ? 'even-row' : 'odd-row'} ${row.isThemeRow ? 'theme-row' : 'subtheme-row'}`}>
                <td className={`theme-cell ${row.isThemeRow ? 'findings-theme-header' : 'findings-theme'}`} title={row.themeDescription}>
                  {row.isThemeRow ? row.theme : ''}
                </td>
                <td className="subtheme-cell findings-subtheme" title={row.subthemeDescription}>
                  {row.subtheme}
                </td>
                <td className="code-cell findings-codes">
                  {row.codes ? (
                    <span className="codes-text">{row.codes}</span>
                  ) : (
                    <span className="no-codes">No codes available</span>
                  )}
                </td>
                <td className="references-cell findings-references">
                  <div className="references-list">
                    {row.references.map((ref, idx) => (
                      <span key={idx} className="reference-number">
                        [{ref}]{idx < row.references.length - 1 ? ', ' : ''}
                      </span>
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

export default TableView;
