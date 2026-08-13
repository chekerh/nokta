import { execFile as execFileCb } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { authMiddleware } from '../lib/auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'upstream',
  'ui-ux-pro-max-skill',
  'src',
  'ui-ux-pro-max',
  'scripts',
  'search.py',
);

function runPythonScript(args) {
  return new Promise((resolve, reject) => {
    execFileCb('python3', [SCRIPT_PATH, ...args], { cwd: path.dirname(SCRIPT_PATH), maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }
      resolve(stdout);
    });
  });
}

export function registerUiUxRoutes(app, log, sprintEngine) {
  // Check if UI/UX Pro Max skill is installed and active
  app.get(
    '/api/v1/uiux/status',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      try {
        await runPythonScript(['--help']);
        res.json({ installed: true, status: 'active', message: 'UI/UX Pro Max Search Engine available' });
      } catch (err) {
        log.warn('UI/UX Pro Max script not responding', { error: err.message });
        res.json({ installed: false, status: 'inactive', error: err.message });
      }
    }),
  );

  // Perform search across product, style, typography, color, landing, chart, and UX domains
  app.post(
    '/api/v1/uiux/search',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { query, domain, stack, limit = 3 } = req.body || {};
      if (!query) throw new AppError('query is required', 400);

      const args = [query, '--json'];
      if (domain) {
        args.push('--domain', domain);
      }
      if (stack) {
        args.push('--stack', stack);
      }
      if (limit) {
        args.push('--max-results', String(limit));
      }

      try {
        const output = await runPythonScript(args);
        let data;
        try {
          data = JSON.parse(output);
        } catch (pe) {
          throw new Error(`Invalid JSON output from script: ${pe.message}`);
        }
        res.json(data);
      } catch (err) {
        log.error('UI/UX search failed', { error: err.message, query });
        throw new AppError(`Search failed: ${err.message}`, 500);
      }
    }),
  );

  // Generate complete custom design system for any requirements/keywords
  app.post(
    '/api/v1/uiux/design-system',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { query, projectName = 'My Project', format = 'markdown', persist = false } = req.body || {};
      if (!query) throw new AppError('query/keywords is required', 400);

      const args = [query, '--design-system', '--format', format, '--project-name', projectName];
      if (persist) {
        args.push('--persist');
      }

      try {
        const output = await runPythonScript(args);
        res.json({
          success: true,
          projectName,
          query,
          format,
          designSystem: output,
        });
      } catch (err) {
        log.error('UI/UX design system generation failed', { error: err.message, query });
        throw new AppError(`Design system generation failed: ${err.message}`, 500);
      }
    }),
  );

  // Enhanced endpoint: Get UI/UX recommendations for a specific sprint item or feature
  app.post(
    '/api/v1/uiux/recommendations',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { itemId, featureDescription, projectContext } = req.body || {};
      if (!featureDescription && !itemId) throw new AppError('Either featureDescription or itemId is required', 400);

      try {
        // Get feature description from itemId if provided
        let query = featureDescription;
        if (itemId) {
          const item = await sprintEngine.getItem(itemId);
          if (!item) throw new Error(`Item not found: ${itemId}`);
          query = `${item.title} ${item.description}`;
        }

        // Enhance with project context if provided
        if (projectContext && projectContext.stacks) {
          query += ` Context: ${projectContext.stacks.join(', ')}`;
        }

        // Get design system recommendations
        const designSystemOutput = await runPythonScript([query, '--design-system', '--format', 'markdown']);

        // Also get specific search results for complementary insights
        const searchResults = await runPythonScript([query, '--json', '--max-results', '5']);
        let searchParsed;
        try {
          searchParsed = JSON.parse(searchResults);
        } catch {
          searchParsed = { results: [] };
        }

        res.json({
          success: true,
          query,
          designSystem: designSystemOutput,
          relatedInsights: searchParsed.results || [],
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        log.error('UI/UX recommendations failed', { error: err.message, body: req.body });
        throw new AppError(`Recommendations failed: ${err.message}`, 500);
      }
    }),
  );

  // Enhanced endpoint: Get UI component suggestions based on functionality
  app.post(
    '/api/v1/uiux/component-suggestions',
    authMiddleware(false),
    asyncHandler(async (req, res) => {
      const { functionality, platform = 'web', preferences = {} } = req.body || {};
      if (!functionality) throw new AppError('functionality is required', 400);

      try {
        // Query for component patterns
        const query = `${functionality} component UI interface`;
        const searchResults = await runPythonScript([query, '--json', '--max-results', '10', '--domain', 'ui']);

        let searchParsed;
        try {
          searchParsed = JSON.parse(searchResults);
        } catch {
          searchParsed = { results: [] };
        }

        // Get platform-specific guidelines
        const platformQuery = `${platform} ${functionality} guidelines patterns`;
        const platformResults = await runPythonScript([platformQuery, '--json', '--max-results', '5']);
        let platformParsed;
        try {
          platformParsed = JSON.parse(platformResults);
        } catch {
          platformParsed = { results: [] };
        }

        // Get accessibility considerations
        const a11yQuery = `${functionality} accessibility WCAG aria`;
        const a11yResults = await runPythonScript([a11yQuery, '--json', '--max-results', '5']);
        let a11yParsed;
        try {
          a11yParsed = JSON.parse(a11yResults);
        } catch {
          a11yParsed = { results: [] };
        }

        res.json({
          success: true,
          functionality,
          platform,
          generalComponents: searchParsed.results || [],
          platformGuidelines: platformParsed.results || [],
          accessibilityConsiderations: a11yParsed.results || [],
          preferences: preferences,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        log.error('UI component suggestions failed', { error: err.message, body: req.body });
        throw new AppError(`Component suggestions failed: ${err.message}`, 500);
      }
    }),
  );
}
