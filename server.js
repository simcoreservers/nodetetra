const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Global reference to the auto dosing process
let autoDosing = null;

// Function to start the auto dosing system
function startAutoDosing() {
  console.log('Starting Auto Dosing system...');
  
  // Launch the auto dosing process
  autoDosing = spawn('python', ['auto_dosing_integration.py'], {
    detached: false, // Keep the process attached to parent
    stdio: 'inherit'  // Share stdout/stderr with parent process
  });
  
  // Handle events
  autoDosing.on('error', (err) => {
    console.error('Failed to start Auto Dosing process:', err);
  });
  
  autoDosing.on('exit', (code, signal) => {
    console.log(`Auto Dosing process exited with code ${code} and signal ${signal}`);
    
    // If the process exits unexpectedly, restart it after a delay
    if (code !== 0 && code !== null) {
      console.log('Auto Dosing process exited unexpectedly, will restart in 10 seconds...');
      setTimeout(() => {
        startAutoDosing();
      }, 10000);
    }
    
    autoDosing = null;
  });
  
  // Ensure the auto dosing process is terminated when the server exits
  process.on('exit', () => {
    if (autoDosing) {
      console.log('Terminating Auto Dosing process...');
      
      // If we have detached: true, we would need to kill the process group
      // But with detached: false, we can simply kill the process
      autoDosing.kill();
    }
  });
  
  // Also handle SIGINT and SIGTERM
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      if (autoDosing) {
        console.log(`Received ${signal}, terminating Auto Dosing process...`);
        autoDosing.kill();
      }
      process.exit(0);
    });
  });
  
  console.log('Auto Dosing system started');
}

// Function to discover all page paths recursively
function discoverPages(directory, basePath = '') {
  const pages = [];
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    
    // Skip hidden files and directories
    if (file.startsWith('.')) continue;
    
    // Skip node_modules
    if (file === 'node_modules') continue;
    
    // Skip API routes and special Next.js files/directories
    if (
      ['api', 'assets', 'components', 'hooks', 'lib', 'utils', 'context', 'styles'].includes(file) ||
      file.includes('middleware') ||
      file.endsWith('.ts') || 
      file.endsWith('.tsx') || 
      file.endsWith('.js') || 
      file.endsWith('.jsx')
    ) {
      // But include page.tsx files as they represent pages
      if (file === 'page.tsx' || file === 'page.js' || file === 'page.jsx') {
        // This is a page file, so this directory represents a page
        pages.push(basePath || '/');
      }
      continue;
    }
    
    if (stat.isDirectory()) {
      // Construct the URL path for this directory
      const urlPath = basePath ? `${basePath}/${file}` : `/${file}`;
      
      // Check if this directory has a page file
      if (
        fs.existsSync(path.join(filePath, 'page.tsx')) || 
        fs.existsSync(path.join(filePath, 'page.js')) ||
        fs.existsSync(path.join(filePath, 'page.jsx'))
      ) {
        pages.push(urlPath);
      }
      
      // Recursively discover pages in subdirectories
      const subPages = discoverPages(filePath, urlPath);
      pages.push(...subPages);
    }
  }
  
  return pages;
}

app.prepare().then(() => {
  console.log('Next.js app preparing...');
  
  // Start the auto dosing system
  startAutoDosing();
  
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });
  
  // Start the server
  server.listen(3000, async (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
    
    // Pre-compile all pages
    try {
      const appDirectory = path.join(__dirname, 'src', 'app');
      if (fs.existsSync(appDirectory)) {
        console.log('Discovering App Router pages...');
        const pages = discoverPages(appDirectory);
        
        // Add root path if not already included
        if (!pages.includes('/')) {
          pages.unshift('/');
        }
        
        // Remove duplicates
        const uniquePages = [...new Set(pages)];
        
        console.log(`Found ${uniquePages.length} pages to pre-compile:`);
        console.log(uniquePages);
        
        // Preload each page sequentially to avoid overwhelming the server
        for (const page of uniquePages) {
          console.log(`Pre-compiling: ${page}`);
          try {
            // Use node-fetch to request the page
            const response = await fetch(`http://localhost:3000${page}`);
            if (response.ok) {
              console.log(`✓ Successfully pre-compiled: ${page}`);
            } else {
              console.warn(`⚠ Page returned status ${response.status}: ${page}`);
            }
          } catch (error) {
            console.error(`✗ Failed to pre-compile: ${page}`, error.message);
          }
          
          // Small delay to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        console.log('Pre-compilation completed');
      } else {
        console.warn('App directory not found at', appDirectory);
      }
    } catch (error) {
      console.error('Error during page discovery:', error);
    }
  });
}).catch(err => {
  console.error('Error preparing Next.js app:', err);
  process.exit(1);
}); 