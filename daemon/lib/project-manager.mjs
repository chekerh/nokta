import { prepare } from '../db/connection.mjs';
export class ProjectManager {
  constructor(options = {}) {
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.projects = new Map(); // projectRoot -> { project, sprintEngine, orchestrator, watcher }
    this.activeProjectRoot = null;
    this.userId = options.userId || null;
    this.orgChart = new Map(); // projectRoot -> { name, description, trustScore, parentProject }
  }

  async addProject(userId, name, rootPath, techStack = 'unknown', parentProject = null) {
    const id = `prj_${Date.now().toString(36)}`;
    prepare('INSERT INTO projects (id, user_id, name, root_path, tech_stack) VALUES (?, ?, ?, ?, ?)').run(
      id,
      userId,
      name,
      rootPath,
      techStack,
    );

    // Initialize org chart entry
    const trustScore = parentProject ? Math.max(0.5, Math.min(1.0, 1.0 - 0.1 * this.orgChart.size)) : 1.0;
    this.orgChart.set(rootPath, { name, description: '', trustScore, parentProject });

    this.projects.set(rootPath, { projectRoot: rootPath, name, techStack });

    return { id, name, rootPath, techStack, trustScore };
  }

  async listProjects(userId) {
    const projects = prepare('SELECT * FROM projects WHERE user_id = ?').all(userId);
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      rootPath: p.root_path,
      techStack: p.tech_stack,
    }));
  }

  async removeProject(id, userId = null) {
    const query = userId
      ? prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
      : prepare('SELECT * FROM projects WHERE id = ?');
    const project = userId ? query.get(id, userId) : query.get(id);

    if (!project) {
      throw new Error(`Project ${id} not found`);
    }

    if (userId) {
      prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId);
    } else {
      prepare('DELETE FROM projects WHERE id = ?').run(id);
    }

    if (project.root_path) {
      this.projects.delete(project.root_path);
      this.orgChart.delete(project.root_path);
      if (this.activeProjectRoot === project.root_path) {
        this.activeProjectRoot = null;
      }
    }

    this.log.info(`Removed project: ${project.name} (${id})`);
    return { success: true, id };
  }

  async getProjectInstance(userId, projectRoot) {
    if (this.projects.has(projectRoot)) {
      return this.projects.get(projectRoot);
    }

    // Verify project exists in DB for this user
    const project = prepare('SELECT * FROM projects WHERE user_id = ? AND root_path = ?').get(userId, projectRoot);

    if (!project) {
      throw new Error(`Project at ${projectRoot} is not registered in Nokta.`);
    }

    this.log.info(`Initializing project instance: ${project.name} (${projectRoot})`);

    // Initialize org chart if not present
    if (!this.orgChart.has(projectRoot)) {
      this.orgChart.set(projectRoot, { name: project.name, description: '', trustScore: 1.0, parentProject: null });
    }

    this.projects.set(projectRoot, { projectRoot, name: project.name, techStack: project.tech_stack });

    return this.projects.get(projectRoot);
  }

  async setActiveProject(projectRoot) {
    this.activeProjectRoot = projectRoot;
    this.log.info(`Active project switched to: ${projectRoot}`);

    // Decay trust scores for inactive projects
    const now = new Date();
    for (const [rootPath, entry] of this.orgChart.entries()) {
      if (rootPath !== projectRoot && entry.lastActive) {
        const daysSinceActive = (now - entry.lastActive) / (1000 * 60 * 60 * 24);
        entry.trustScore = Math.max(0.1, entry.trustScore * Math.pow(0.95, daysSinceActive));
      }
    }
  }

  getActiveProjectRoot() {
    return this.activeProjectRoot;
  }

  getOrgChart() {
    return Array.from(this.orgChart.entries()).map(([rootPath, entry]) => ({
      rootPath,
      name: entry.name,
      trustScore: entry.trustScore,
      parentProject: entry.parentProject,
    }));
  }

  async routeAIRequest(projectRoot, goal, options = {}) {
    const sourceProject = this.projects.has(projectRoot) ? projectRoot : null;
    const orgChart = this.getOrgChart();

    // Determine best provider based on org chart trust and project context
    const targetProject = options.targetProject || this._findBestProject(goal, orgChart);

    // Route the request with appropriate provider selection
    return {
      sourceProject,
      targetProject,
      orgChart,
      goal,
      options,
      routedAt: new Date().toISOString(),
    };
  }

  _findBestProject(goal, orgChart) {
    // Simple heuristic: if goal contains financial terms, route to trading-related project
    const financialKeywords = ['finance', 'trading', 'investment', 'money', 'fund'];
    const goalLower = goal.toLowerCase();
    for (const keyword of financialKeywords) {
      if (goalLower.includes(keyword)) {
        // Find a project with higher trust score for financial tasks
        let bestProject = null;
        let bestScore = 0;
        for (const [rootPath, entry] of orgChart.entries()) {
          if (entry.trustScore > bestScore) {
            bestScore = entry.trustScore;
            bestProject = rootPath;
          }
        }
        return bestProject || null;
      }
    }
    return null;
  }
}
