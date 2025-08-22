import fs from 'fs';
import path from 'path';
import { GEMINI_API_KEY, PG_CONFIG } from './credentials.js';
import { Client } from 'pg';
// Import pdf-parse implementation directly to avoid the package's debug entrypoint
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pdfParse = require('pdf-parse/lib/pdf-parse.js');

// Try to load the real Google GenAI client if available
let realAI = null;
try {
  const { GoogleGenAI } = await import('@google/genai');
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is missing in credentials.js. Real-Gemini-only mode requires a valid API key. Exiting.');
    process.exit(1);
  }
  realAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log('Using real @google/genai client.');
} catch (err) {
  console.error('Failed to load @google/genai client. Real-Gemini-only mode requires the SDK; exiting. Error:', err && err.message ? err.message : err);
  process.exit(1);
}

// Initialize PostgreSQL client
const client = new Client(PG_CONFIG);

// Fix __dirname for ESM
import url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const RATE_LIMIT_MS = 4000; // 4 seconds between requests

// Function declaration schema (plain JSON Schema types) - now includes themes, sub-themes, codes, and reference numbers
const insertPaperFunctionDeclaration = {
  name: 'insert_paper',
  description: 'Insert research paper analysis results with themes, sub-themes, codes, and reference numbers for thematic analysis',
  parameters: {
    type: 'object',
    properties: {
      paper_title: {
        type: 'string',
        description: 'The title of the research paper'
      },
      authors: {
        type: 'string', 
        description: 'The authors of the paper'
      },
      year: {
        type: 'string',
        description: 'Publication year'
      },
      doi: {
        type: 'string',
        description: 'DOI if available'
      },
      abstract: {
        type: 'string',
        description: 'Paper abstract or summary'
      },
      key_findings: {
        type: 'string',
        description: 'Key findings from the paper'
      },
      methodology: {
        type: 'string', 
        description: 'Research methodology used'
      },
      reference_number: {
        type: 'integer',
        description: 'Sequential reference number for this paper. Start with 1 for the first paper and increment by 1 for each subsequent paper (e.g., 1, 2, 3, 4, 5...)'
      },
      themes: {
        type: 'array',
        description: 'Main themes identified in the paper',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Theme name - extract the main thematic area from the paper content (e.g., what the paper is fundamentally about)'
            },
            description: {
              type: 'string', 
              description: 'Theme description'
            },
            subthemes: {
              type: 'array',
              description: 'Sub-themes within this theme',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Sub-theme name - identify specific aspects or components within the main theme that this paper addresses'
                  },
                  description: {
                    type: 'string',
                    description: 'Sub-theme description'
                  },
                  codes: {
                    type: 'array',
                    description: 'Specific codes/keywords found in this paper for this sub-theme, each with supporting evidence',
                    items: {
                      type: 'object',
                      properties: {
                        name: {
                          type: 'string',
                          description: 'Code or keyword (e.g., GitHub Copilot, code generation, developer productivity, security weaknesses)'
                        },
                        quote: {
                          type: 'string',
                          description: 'Direct quote or text snippet from the paper that supports this code (1-3 sentences that explain or mention this concept)'
                        }
                      },
                      required: ['name', 'quote']
                    }
                  }
                },
                required: ['name', 'description', 'codes']
              }
            }
          },
          required: ['name', 'description', 'subthemes']
        }
      }
    },
    required: ['paper_title', 'authors', 'themes', 'reference_number']
  }
};

// Helper: extract sentences containing any keyword (up to maxCount)
function extractSentencesWithKeywords(text, keywords, maxCount = 3) {
  const sentences = text
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const found = [];
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  for (const s of sentences) {
    const low = s.toLowerCase();
    if (lowerKeywords.some(k => low.includes(k))) {
      found.push(s);
      if (found.length >= maxCount) break;
    }
  }
  return found;
}

// Improved mock Gemini: produce a structured function-call-like response per paper
// NOTE: Kept for reference but will not be used in real-Gemini-only mode.
async function mockGeminiAnalyze(text, filename) {
  const keywords = [
    'copilot', 'github copilot', 'autocomplete', 'suggest', 'code generation',
    'completion', 'pair programming', 'prompt', 'assistant', 'snippet', 'prompt engineering', 'RAG', 'retrieval-augmented'
  ];

  const matches = extractSentencesWithKeywords(text, keywords, 6);
  const relevant = matches.length > 0;

  // heuristic: extract short tactics by finding phrases around keywords
  const tacticsSet = new Set();
  for (const s of matches) {
    // simple heuristics to extract tactic phrases
    const low = s.toLowerCase();
    if (low.includes('prompt')) tacticsSet.add('Prompt engineering');
    if (low.includes('retrieval') || low.includes('rag')) tacticsSet.add('Retrieval-augmented generation (RAG)');
    if (low.includes('autocomplete') || low.includes('completion')) tacticsSet.add('Code completion / autocomplete');
    if (low.includes('suggest') || low.includes('assistant')) tacticsSet.add('Code suggestion via Copilot');
    if (low.includes('pair')) tacticsSet.add('AI pair programming');
    if (low.includes('knowledge') || low.includes('knowledge graph')) tacticsSet.add('Knowledge-base integration');
  }
  const tactics = Array.from(tacticsSet);

  // Try to pick a year from filename or fallback
  let year = null;
  const yearMatch = filename && filename.match(/(19|20)\d{2}/);
  if (yearMatch) year = parseInt(yearMatch[0], 10);

  const title = filename || 'Unknown Title';
  const authors = 'Unknown';

  if (relevant) {
    const justification = matches.join(' ');
    const summary = `Extracted ${tactics.length} tactic(s): ${tactics.join(', ')}.`;
    
    // Mock themes and subthemes extraction
    const themes = [];
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('productivity') || lowerText.includes('efficiency')) {
      themes.push({
        name: 'Developer Productivity',
        description: 'Improvements in coding speed and efficiency',
        subthemes: [
          { name: 'Code Generation Speed', description: 'Faster code writing and completion' },
          { name: 'Task Automation', description: 'Automating repetitive coding tasks' }
        ]
      });
    }
    
    if (lowerText.includes('quality') || lowerText.includes('correctness') || lowerText.includes('bug')) {
      themes.push({
        name: 'Code Quality',
        description: 'Improvements in code correctness and maintainability',
        subthemes: [
          { name: 'Error Reduction', description: 'Reducing bugs and errors in code' },
          { name: 'Code Standards', description: 'Adherence to coding standards and best practices' }
        ]
      });
    }
    
    if (lowerText.includes('learning') || lowerText.includes('education') || lowerText.includes('novice')) {
      themes.push({
        name: 'Learning Enhancement',
        description: 'Supporting developer learning and skill development',
        subthemes: [
          { name: 'Skill Development', description: 'Helping developers learn new skills' },
          { name: 'Code Understanding', description: 'Better comprehension of existing code' }
        ]
      });
    }
    
    return {
      functionCalls: [{
        name: 'insert_paper',
        args: {
          authors,
          title,
          year: year || 0,
          relevant: true,
          tactics,
          summary,
          justification,
          themes
        }
      }]
    };
  }
  return { text: 'No relevant Copilot tactics found.' };
}

// Function to get the next available reference number
async function getNextReferenceNumber() {
  const result = await client.query('SELECT MAX(reference_number) as max_ref FROM research_results');
  const maxRef = result.rows[0].max_ref;
  return maxRef ? maxRef + 1 : 1;
}

// Function to call Gemini SDK
async function callGemini(prompt, filename, pdfBuffer) {
  if (!realAI) throw new Error('Real Gemini client not initialized (real-Gemini-only mode).');
  try {
    const contents = [
      { text: prompt },
      { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdfBuffer).toString('base64') } }
    ];
    const response = await realAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: contents,
      config: { tools: [{ functionDeclarations: [insertPaperFunctionDeclaration] }] }
    });
    return response;
  } catch (err) {
    throw new Error(`Gemini API error: ${err && err.message ? err.message : err}`);
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Function to insert results into the database
async function insertPaperResult(paperData) {
  const { paper_title, authors, year, doi, abstract, key_findings, methodology, reference_number, themes } = paperData;
  
  // Check if paper already exists
  const existingPaper = await client.query('SELECT id FROM research_results WHERE paper_title = $1', [paper_title]);
  
  if (existingPaper.rows.length > 0) {
    console.log('Skipping insert, already exists:', paper_title);
    return;
  }
  
  // Insert the paper
  const paperInsert = await client.query(
    'INSERT INTO research_results (paper_title, authors, year, doi, abstract, key_findings, methodology, reference_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [paper_title, authors, year, doi, abstract, key_findings, methodology, reference_number]
  );
  
  const paperId = paperInsert.rows[0].id;
  console.log(`Inserted paper with ID: ${paperId}, Reference: [${reference_number}]`);
  
  // Process themes, sub-themes, and codes
  if (themes && themes.length > 0) {
    for (const theme of themes) {
      // Find or create theme
      let themeResult = await client.query('SELECT id FROM themes WHERE name = $1', [theme.name]);
      let themeId;
      
      if (themeResult.rows.length === 0) {
        // Create new theme
        const newTheme = await client.query(
          'INSERT INTO themes (name, description) VALUES ($1, $2) RETURNING id',
          [theme.name, theme.description]
        );
        themeId = newTheme.rows[0].id;
        console.log(`Created new theme: ${theme.name} (ID: ${themeId})`);
      } else {
        themeId = themeResult.rows[0].id;
      }
      
      // Process subthemes
      if (theme.subthemes && theme.subthemes.length > 0) {
        for (const subtheme of theme.subthemes) {
          // Find or create subtheme
          let subthemeResult = await client.query('SELECT id FROM subthemes WHERE name = $1', [subtheme.name]);
          let subthemeId;
          
          if (subthemeResult.rows.length === 0) {
            // Create new subtheme
            const newSubtheme = await client.query(
              'INSERT INTO subthemes (name, description) VALUES ($1, $2) RETURNING id',
              [subtheme.name, subtheme.description]
            );
            subthemeId = newSubtheme.rows[0].id;
            console.log(`Created new subtheme: ${subtheme.name} (ID: ${subthemeId})`);
          } else {
            subthemeId = subthemeResult.rows[0].id;
          }
          
          // Link theme to subtheme (if not already linked)
          const existingThemeSubtheme = await client.query(
            'SELECT 1 FROM theme_subthemes WHERE theme_id = $1 AND subtheme_id = $2',
            [themeId, subthemeId]
          );
          
          if (existingThemeSubtheme.rows.length === 0) {
            await client.query(
              'INSERT INTO theme_subthemes (theme_id, subtheme_id) VALUES ($1, $2)',
              [themeId, subthemeId]
            );
            console.log(`Linked theme ${themeId} to subtheme ${subthemeId}`);
          }
          
          // Link article to subtheme (if not already linked)
          const existingArticleSubtheme = await client.query(
            'SELECT 1 FROM article_subthemes WHERE article_id = $1 AND subtheme_id = $2',
            [paperId, subthemeId]
          );
          
          if (existingArticleSubtheme.rows.length === 0) {
            await client.query(
              'INSERT INTO article_subthemes (article_id, subtheme_id) VALUES ($1, $2)',
              [paperId, subthemeId]
            );
            console.log(`Linked article ${paperId} to subtheme ${subthemeId}`);
          }
          
          // Process codes for this subtheme
          if (subtheme.codes && subtheme.codes.length > 0) {
            for (const codeObj of subtheme.codes) {
              // Handle both old string format and new object format for backward compatibility
              const codeName = typeof codeObj === 'string' ? codeObj : codeObj.name;
              const codeQuote = typeof codeObj === 'object' ? codeObj.quote : null;
              
              // Find or create code
              let codeResult = await client.query('SELECT id FROM codes WHERE name = $1', [codeName]);
              let codeId;
              
              if (codeResult.rows.length === 0) {
                // Create new code
                const newCode = await client.query(
                  'INSERT INTO codes (name) VALUES ($1) RETURNING id',
                  [codeName]
                );
                codeId = newCode.rows[0].id;
                console.log(`Created new code: ${codeName} (ID: ${codeId})`);
              } else {
                codeId = codeResult.rows[0].id;
              }
              
              // Link article to code within this subtheme (if not already linked)
              const existingArticleCode = await client.query(
                'SELECT 1 FROM article_codes WHERE article_id = $1 AND code_id = $2 AND subtheme_id = $3',
                [paperId, codeId, subthemeId]
              );
              
              if (existingArticleCode.rows.length === 0) {
                await client.query(
                  'INSERT INTO article_codes (article_id, code_id, subtheme_id, evidence_quote) VALUES ($1, $2, $3, $4)',
                  [paperId, codeId, subthemeId, codeQuote]
                );
                console.log(`Linked article ${paperId} to code "${codeName}" in subtheme ${subthemeId}`);
              }
            }
          }
        }
      }
    }
  }
}

// Function to drop and recreate all tables
async function dropAndCreateTables() {
  const dropQueries = [
    'DROP TABLE IF EXISTS article_codes CASCADE',
    'DROP TABLE IF EXISTS codes CASCADE',
    'DROP TABLE IF EXISTS article_subthemes CASCADE',
    'DROP TABLE IF EXISTS theme_subthemes CASCADE', 
    'DROP TABLE IF EXISTS subthemes CASCADE',
    'DROP TABLE IF EXISTS themes CASCADE',
    'DROP TABLE IF EXISTS research_results CASCADE'
  ];
  
  const createQueries = [
    `CREATE TABLE research_results (
      id SERIAL PRIMARY KEY,
      paper_title TEXT UNIQUE NOT NULL,
      authors TEXT,
      year TEXT,
      doi TEXT,
      abstract TEXT,
      key_findings TEXT,
      methodology TEXT,
      reference_number INTEGER UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE themes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE subthemes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE codes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE theme_subthemes (
      theme_id INTEGER REFERENCES themes(id) ON DELETE CASCADE,
      subtheme_id INTEGER REFERENCES subthemes(id) ON DELETE CASCADE,
      PRIMARY KEY (theme_id, subtheme_id)
    )`,
    `CREATE TABLE article_subthemes (
      article_id INTEGER REFERENCES research_results(id) ON DELETE CASCADE,
      subtheme_id INTEGER REFERENCES subthemes(id) ON DELETE CASCADE,
      PRIMARY KEY (article_id, subtheme_id)
    )`,
    `CREATE TABLE article_codes (
      article_id INTEGER REFERENCES research_results(id) ON DELETE CASCADE,
      code_id INTEGER REFERENCES codes(id) ON DELETE CASCADE,
      subtheme_id INTEGER REFERENCES subthemes(id) ON DELETE CASCADE,
      evidence_quote TEXT,
      PRIMARY KEY (article_id, code_id, subtheme_id)
    )`
  ];
  
  // Drop tables
  for (const query of dropQueries) {
    await client.query(query);
  }
  console.log('Dropped existing tables');
  
  // Create tables
  for (const query of createQueries) {
    await client.query(query);
  }
  console.log('Created new tables with themes, sub-themes, codes, and references structure');
}

// Top-level error handlers to avoid unexpected exits
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Refactor processPapers to handle blocks of PDFs
async function processPapers() {
  const researchPapersDir = path.join(__dirname, 'Research Papers');
  let files = [];
  try {
    files = fs.readdirSync(researchPapersDir).filter(file => file.endsWith('.pdf'));
    console.log(`📂 Found ${files.length} PDF files to process`);
  } catch (err) {
    console.error('❌ Failed to read Research Papers directory:', err.message);
    return;
  }

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    processedCount++;
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📄 Processing file ${processedCount}/${files.length}: ${file}`);
    console.log(`${'─'.repeat(80)}`);
    
    try {
      const filePath = path.join(researchPapersDir, file);
      let fileBuffer;
      try {
        console.log('📖 Reading PDF file...');
        fileBuffer = fs.readFileSync(filePath);
      } catch (err) {
        console.error('❌ Failed to read file', file, err.message);
        errorCount++;
        continue;
      }

      let pdfData;
      try {
        console.log('🔍 Parsing PDF content...');
        pdfData = await pdfParse(fileBuffer);
        console.log(`✅ Extracted ${pdfData.text?.length || 0} characters`);
      } catch (err) {
        console.error('❌ Failed to parse PDF', file, err.message);
        errorCount++;
        continue;
      }

      // Get next reference number
      const nextRefNumber = await getNextReferenceNumber();
      
      // Build the system prompt focused on GitHub Copilot tactics and methods
      const pdfText = pdfData && pdfData.text ? pdfData.text : '';
      const prompt = `You are an expert research assistant analyzing research papers related to AI-assisted software development and GitHub Copilot.

IMPORTANT: Use reference_number: ${nextRefNumber} for this paper.

ANALYZE THIS PAPER AND INCLUDE IT if it discusses ANY AI-related software development topics:

✅ DEFINITELY INCLUDE if paper mentions:
- GitHub Copilot, Copilot, AI coding assistants, AI programming tools
- Code completion with AI, AI code generation, automated code writing with AI/ML
- AI in software development, AI for programming, machine learning for code
- Developer productivity with AI tools, AI-enhanced coding efficiency
- LLMs for code, language models in programming, GPT for programming
- AI adoption in software engineering, AI-based programming tools
- Novice programmers using AI coding assistants
- AI-assisted development, machine learning in software engineering
- Code quality with AI, AI-powered testing, AI code review
- Programming education with AI support, AI tutoring for coding

✅ ALSO INCLUDE papers about:
- Any AI/ML system applied to programming or software development
- Large language models used for any coding tasks
- Machine learning for developer productivity or code assistance
- AI tools for software engineering (even if not specifically Copilot)
- Automated programming with AI/ML techniques
- AI-powered IDEs, smart code completion systems
- Machine learning for code analysis, bug detection, or code generation

🎯 EXTRACT THEMES AND SUB-THEMES FROM THE PAPER:
Read the paper carefully and identify the main themes and sub-themes that emerge from its content. 
Look for the key concepts, topics, and areas of focus that the authors discuss.

Examples of theme categories that might emerge (but don't limit yourself to these):
- AI Tools and Applications
- Developer Productivity and Efficiency  
- Code Quality and Security
- Educational Applications
- Human-AI Interaction
- Software Engineering Practices
- Emerging AI Technologies

For sub-themes, identify the specific aspects or components within each main theme that the paper addresses.
Use terminology and concepts that actually appear in the paper, but group them into coherent categories that could accommodate other related papers.

📝 IMPORTANT: For each code you identify, provide a direct quote from the paper that supports it. The quote should be 1-3 sentences that explain, mention, or demonstrate the concept.

⚠️ REQUIREMENT: Paper must mention AI, ML, LLMs, or intelligent systems in context of programming/software development.`;
      console.log('🤖 Sending to Gemini for analysis...');

      let resp;
      try {
        resp = await callGemini(prompt + '\n\n' + pdfText, file, fileBuffer);
        console.log('✅ Received response from Gemini');
      } catch (err) {
        console.error('❌ Gemini error for', file, err.message);
        errorCount++;
        continue;
      }

      try {
        // Check for function calls in the response
        if (resp && resp.functionCalls && resp.functionCalls.length > 0) {
          const functionCall = resp.functionCalls[0];
          if (functionCall && functionCall.name === 'insert_paper') {
            const { paper_title, authors, year, doi, abstract, key_findings, methodology, reference_number, themes } = functionCall.args || {};
            
            // Verify the reference number matches what we expected
            if (reference_number !== nextRefNumber) {
              console.log(`⚠️  Warning: Expected reference number ${nextRefNumber}, got ${reference_number}. Using expected number.`);
            }
            
            // Use the expected reference number to avoid conflicts
            const correctedData = { paper_title, authors, year, doi, abstract, key_findings, methodology, reference_number: nextRefNumber, themes };
            
            // Require essential fields for thematic analysis
            if (paper_title && authors && themes) {
              console.log('💾 Saving to database...');
              console.log(`   📝 Title: ${paper_title}`);
              console.log(`   👥 Authors: ${authors}`);
              console.log(`   📅 Year: ${year || 'N/A'}`);
              console.log(`   🔢 Reference: [${nextRefNumber}]`);
              console.log(`   �️  Themes: ${themes?.length || 0}`);
              
              // Count total codes across all subthemes
              let totalCodes = 0;
              themes?.forEach(theme => {
                theme.subthemes?.forEach(subtheme => {
                  totalCodes += subtheme.codes?.length || 0;
                });
              });
              console.log(`   🏷️  Codes: ${totalCodes}`);
              
              try {
                await insertPaperResult(correctedData);
                console.log('✅ Successfully saved to database!');
                successCount++;
              } catch (e) {
                console.error('❌ Database insert error:', e.message);
                errorCount++;
              }
            } else {
              console.log('⚠️  Paper missing required fields (title, authors, or themes)');
              errorCount++;
            }
          } else {
            console.log('⚠️  Function call is not insert_paper:', functionCall && functionCall.name);
            errorCount++;
          }
        } else {
          console.log('⚠️  No function call found in response - paper may not be relevant');
          if (resp && resp.text) {
            console.log('Response text:', resp.text.substring(0, 200) + '...');
          }
          errorCount++;
        }
      } catch (err) {
        console.error('❌ Error handling Gemini response for', file, err.message);
        errorCount++;
      }

      // rate-limit between papers
      console.log('⏳ Waiting 3 seconds before next file...');
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error('❌ Unexpected error processing file', file, err && err.stack ? err.stack : err);
      errorCount++;
    }
  }

  // Show final summary
  console.log(`\n${'═'.repeat(80)}`);
  console.log('🎉 PROCESSING COMPLETE!');
  console.log(`${'═'.repeat(80)}`);
  console.log(`📊 Summary:`);
  console.log(`   • Total files: ${files.length}`);
  console.log(`   • Successfully processed: ${successCount}`);
  console.log(`   • Errors/Not relevant: ${errorCount}`);
  console.log(`   • Success rate: ${Math.round((successCount / files.length) * 100)}%`);
}

// Connect to the database and start processing
(async () => {
  console.log('🚀 Starting Research Paper Analysis');
  console.log(`📅 Started at: ${new Date().toLocaleString()}`);
  
  try {
    console.log('\n🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to the database successfully!');

    console.log('\n🛠️  Setting up database tables...');
    await dropAndCreateTables();
    console.log('✅ Tables recreated successfully!');

    console.log('\n📚 Starting paper processing...');
    await processPapers();

    console.log('\n🎊 All papers processed successfully!');
  } catch (err) {
    console.error('❌ Fatal Error:', err);
  } finally {
    try { 
      await client.end(); 
      console.log('🔌 Database connection closed.');
    } catch (e) { /* ignore */ }
  }
})();
