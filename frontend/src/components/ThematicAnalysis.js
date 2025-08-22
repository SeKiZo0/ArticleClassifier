import React, { useState } from 'react';

const ThematicAnalysis = ({ data }) => {
  const [collapsedThemes, setCollapsedThemes] = useState(new Set());

  const toggleTheme = (themeId) => {
    const newCollapsed = new Set(collapsedThemes);
    if (newCollapsed.has(themeId)) {
      newCollapsed.delete(themeId);
    } else {
      newCollapsed.add(themeId);
    }
    setCollapsedThemes(newCollapsed);
  };

  if (!data || !data.themes) {
    return <div>No data available</div>;
  }

  return (
    <div className="thematic-analysis">
      <h2 className="section-header">
        Thematic Analysis Structure
      </h2>
      
      {data.themes.map((theme) => (
        <div key={theme.id} className="theme-section">
          <h3 
            className={`theme-header ${collapsedThemes.has(theme.id) ? 'collapsed' : 'expanded'}`}
            onClick={() => toggleTheme(theme.id)}
          >
            Theme: {theme.name}
          </h3>
          
          {!collapsedThemes.has(theme.id) && (
            <>
              {theme.description && (
                <div style={{ padding: '10px 30px', fontStyle: 'italic', color: '#666' }}>
                  {theme.description}
                </div>
              )}
              
              <div className="subtheme-list">
                {theme.subthemes.map((subtheme) => (
                  <div key={subtheme.id} className="subtheme-item">
                    <h4 className="subtheme-title">
                      <span className="subtheme-bullet">•</span>
                      Sub-theme: {subtheme.name}
                    </h4>
                    
                    {subtheme.description && (
                      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: '10px' }}>
                        {subtheme.description}
                      </div>
                    )}

                    {subtheme.codes && subtheme.codes.length > 0 && (
                      <div className="codes-section">
                        <div className="codes-label">Tactics & Methods:</div>
                        <div className="codes-list">
                          {subtheme.codes.map((code, index) => (
                            <span key={index} className="code-tag">
                              "{code.name}"
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {subtheme.references && subtheme.references.length > 0 && (
                      <div className="references-section">
                        <div className="references-label">References:</div>
                        <div className="references-list">
                          {subtheme.references.map((ref, index) => (
                            <span key={index} className="reference-tag">
                              [{ref}]
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default ThematicAnalysis;
