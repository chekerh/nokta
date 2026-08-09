import { prepare } from '../db/connection.mjs';
import { SprintEngine } from './sprint-engine.mjs';
import { AgentOrchestrator } from '../agent/orchestrator.mjs';
import { AutoWatcher } from './auto-watcher.mjs';

export class ProjectManager {
  constructor(options = {}) {
    this.log = options.log || { debug() {}, info() {}, warn() {}, error: console.error };
    this.projects = new Map(); // projectRoot -> { project, sprintEngine, orchestrator, watcher }
    this.activeProjectRoot = null;
  }

  async addProject(userId, name, rootPath, techStack = 'unknown') {
    const id = `prj_${Date.now().toString(36)}`;
    prepare('INSERT INTO projects (id, user_id, name, root_path, tech_stack) VALUES (?, ?, ?, ?, ?)').run(
      id,
      userId,
      name,
      rootPath,
      techStack,
    );

    return { id, name, rootPath, techStack };
  }

  async listProjects(userId) {
    const projects = prepare('SELECT * FROM projects WHERE user_id = ?').all(userId);
    return projects;
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

    // These services are initialized per-project
    // Note: chatHandler is shared across projects in server.mjs
    // We'll need to pass the shared chatHandler into the orchestrator
    // The a-priori instantiation happens in server.mjs, we just need the components.
    // Since we can't easily instantiate everything here without the shared services,
    // the ProjectManager will provide the CONFIG and the Server will instantiate the service.

    return { project };
  }

  async setActiveProject(projectRoot) {
    this.activeProjectRoot = projectRoot;
    this.log.info(`Active project switched to: ${projectRoot}`);
  }

  getActiveProjectRoot() {
    return this.activeProjectRoot;
  }

  // Lazy-load and cache project services
  async getOrInitServices(userId, projectRoot, sharedServices) {
    const { chatHandler, log, providerManager } = sharedServices;

    if (this.projects.has(projectRoot)) {
      return this.projects.get(projectRoot);
    }

    const project = prepare('SELECT * FROM projects WHERE user_id = ? AND root_path = ?').get(userId, projectRoot);

    if (!project) throw new Error('Project not registered.');

    const sprintEngine = new SprintEngine(projectRoot, { log, chatHandler });
    const orchestrator = new AgentOrchestrator(projectRoot, { log, providerManager, chatHandler, sprintEngine });
    const watcher = new AutoWatcher(projectRoot, { log, orchestrator, sprintEngine });

    watcher.start();

    const instance = {
      project,
      sprintEngine,
      orchestrator,
      watcher,
    };

    this.projects.set(projectRoot, instance);
    this.activeProjectRoot = projectRoot;
    return instance;
  }

  async removeProject(projectId) {
    const project = prepare('SELECT root_path FROM projects WHERE id = ?').get(projectId);
    prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    if (project && this.projects.has(project.root_path)) {
      const instance = this.projects.get(project.root_path);
      instance.watcher.stop();
      this.projects.delete(project.root_path);
    }
  }
}
