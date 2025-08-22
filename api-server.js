import express from 'express';
import { Client } from 'pg';
import { PG_CONFIG } from './credentials.js';
import cors from 'cors';

const app = express();
const port = 3001;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Initialize PostgreSQL client
const client = new Client(PG_CONFIG);

// Connect to database
client.connect()
  .then(() => console.log('✅ Connected to PostgreSQL for API server'))
  .catch(err => console.error('❌ Database connection error:', err));

// API endpoint to get thematic analysis data
app.get('/api/thematic-analysis', async (req, res) => {
  try {
    // Get summary statistics
    const summaryQueries = await Promise.all([
      client.query('SELECT COUNT(*) FROM research_results'),
      client.query('SELECT COUNT(*) FROM themes'),
      client.query('SELECT COUNT(*) FROM subthemes'),
      client.query('SELECT COUNT(*) FROM codes')
    ]);

    const summary = {
      totalPapers: parseInt(summaryQueries[0].rows[0].count),
      totalThemes: parseInt(summaryQueries[1].rows[0].count),
      totalSubthemes: parseInt(summaryQueries[2].rows[0].count),
      totalCodes: parseInt(summaryQueries[3].rows[0].count)
    };

    // Get themes with their subthemes, codes, and references
    const themesQuery = `
      SELECT 
        t.id as theme_id,
        t.name as theme_name,
        t.description as theme_description
      FROM themes t
      ORDER BY t.name
    `;

    const themesResult = await client.query(themesQuery);
    const themes = [];

    for (const themeRow of themesResult.rows) {
      // Get subthemes for this theme
      const subthemesQuery = `
        SELECT 
          s.id as subtheme_id,
          s.name as subtheme_name,
          s.description as subtheme_description
        FROM subthemes s
        JOIN theme_subthemes ts ON s.id = ts.subtheme_id
        WHERE ts.theme_id = $1
        ORDER BY s.name
      `;

      const subthemesResult = await client.query(subthemesQuery, [themeRow.theme_id]);
      const subthemes = [];

      for (const subthemeRow of subthemesResult.rows) {
        // Get codes for this subtheme with their evidence quotes
        const codesQuery = `
          SELECT DISTINCT c.name as code_name, 
                 array_agg(DISTINCT ac.evidence_quote) FILTER (WHERE ac.evidence_quote IS NOT NULL) as quotes
          FROM codes c
          JOIN article_codes ac ON c.id = ac.code_id
          WHERE ac.subtheme_id = $1
          GROUP BY c.id, c.name
          ORDER BY c.name
        `;

        const codesResult = await client.query(codesQuery, [subthemeRow.subtheme_id]);
        const codes = codesResult.rows.map(row => ({ 
          name: row.code_name,
          quotes: row.quotes || []
        }));

        // Get references (paper reference numbers) for this subtheme
        const referencesQuery = `
          SELECT DISTINCT rr.reference_number
          FROM research_results rr
          JOIN article_subthemes asub ON rr.id = asub.article_id
          WHERE asub.subtheme_id = $1
          ORDER BY rr.reference_number
        `;

        const referencesResult = await client.query(referencesQuery, [subthemeRow.subtheme_id]);
        const references = referencesResult.rows
          .map(row => row.reference_number)
          .filter(ref => ref !== null);

        subthemes.push({
          id: subthemeRow.subtheme_id,
          name: subthemeRow.subtheme_name,
          description: subthemeRow.subtheme_description,
          codes: codes,
          references: references
        });
      }

      themes.push({
        id: themeRow.theme_id,
        name: themeRow.theme_name,
        description: themeRow.theme_description,
        subthemes: subthemes
      });
    }

    res.json({
      summary: summary,
      themes: themes
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch thematic analysis data',
      details: error.message 
    });
  }
});

// API endpoint to get paper details
app.get('/api/papers/:referenceNumber', async (req, res) => {
  try {
    const { referenceNumber } = req.params;
    
    const paperQuery = `
      SELECT 
        paper_title,
        authors,
        year,
        doi,
        abstract,
        key_findings,
        methodology,
        reference_number
      FROM research_results
      WHERE reference_number = $1
    `;

    const result = await client.query(paperQuery, [parseInt(referenceNumber)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch paper details',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 API server running at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔌 Shutting down API server...');
  await client.end();
  process.exit(0);
});
