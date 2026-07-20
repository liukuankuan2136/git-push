import { DevOpsProject, DevOpsProvider, DevOpsTask, DevOpsTaskType, DevProject, DictValue, Region, WorkHourType } from './DevOpsProvider';

export class DevOpsCache {
  private projectsCachedAt = 0;
  private projects: DevOpsProject[] = [];
  private readonly tasks = new Map<string, { cachedAt: number; items: DevOpsTask[] }>();
  // @AI-Begin Q3P8M 20260521 @@cc
  private workHourTypesCachedAt = 0;
  private workHourTypes: WorkHourType[] = [];
  // @AI-End Q3P8M 20260521 @@cc
  // @AI-Begin C6D9E 20260720 @@claudeCode
  private devProjectsCachedAt = 0;
  private devProjects: DevProject[] = [];
  private regionsCachedAt = 0;
  private regions: Region[] = [];
  private readonly dictValuesByCode = new Map<string, { cachedAt: number; items: DictValue[] }>();
  // @AI-End C6D9E 20260720 @@claudeCode

  constructor(private readonly ttlMs: number) {}

  async getProjects(provider: DevOpsProvider): Promise<DevOpsProject[]> {
    if (this.ttlMs > 0 && Date.now() - this.projectsCachedAt < this.ttlMs) {
      return this.projects;
    }

    this.projects = await provider.fetchProjects();
    this.projectsCachedAt = Date.now();
    return this.projects;
  }

  // @AI-Begin T8K2M 20260518 @@cc
  async getTasks(provider: DevOpsProvider, type: DevOpsTaskType): Promise<DevOpsTask[]> {
    const key = `${type}`;
    const items = await provider.fetchTasks(type);
    this.tasks.set(key, { cachedAt: Date.now(), items });
    return items;
  }
  // @AI-End T8K2M 20260518 @@cc

  // @AI-Begin Q3P8M 20260521 @@cc
  async getWorkHourTypes(provider: DevOpsProvider): Promise<WorkHourType[]> {
    if (this.ttlMs > 0 && Date.now() - this.workHourTypesCachedAt < this.ttlMs) {
      return this.workHourTypes;
    }

    this.workHourTypes = await provider.fetchWorkHourTypes!();
    this.workHourTypesCachedAt = Date.now();
    return this.workHourTypes;
  }
  // @AI-End Q3P8M 20260521 @@cc

  // @AI-Begin C6D9E 20260720 @@claudeCode
  async getDevProjects(provider: DevOpsProvider): Promise<DevProject[]> {
    if (this.ttlMs > 0 && Date.now() - this.devProjectsCachedAt < this.ttlMs) {
      return this.devProjects;
    }
    this.devProjects = await provider.fetchDevProjects!();
    this.devProjectsCachedAt = Date.now();
    return this.devProjects;
  }

  async getRegions(provider: DevOpsProvider): Promise<Region[]> {
    if (this.ttlMs > 0 && Date.now() - this.regionsCachedAt < this.ttlMs) {
      return this.regions;
    }
    this.regions = await provider.fetchRegions!();
    this.regionsCachedAt = Date.now();
    return this.regions;
  }

  async getDictValues(provider: DevOpsProvider, catalogCode: string): Promise<DictValue[]> {
    const cached = this.dictValuesByCode.get(catalogCode);
    if (this.ttlMs > 0 && cached && Date.now() - cached.cachedAt < this.ttlMs) {
      return cached.items;
    }
    const items = await provider.fetchDictValues!(catalogCode);
    this.dictValuesByCode.set(catalogCode, { cachedAt: Date.now(), items });
    return items;
  }
  // @AI-End C6D9E 20260720 @@claudeCode

  // @AI-Begin X9N7P 20260518 @@cc
  clear(): void {
    this.projects = [];
    this.projectsCachedAt = 0;
    this.tasks.clear();
    // @AI-Begin Q3P8M 20260521 @@cc
    this.workHourTypes = [];
    this.workHourTypesCachedAt = 0;
    // @AI-End Q3P8M 20260521 @@cc
    // @AI-Begin C6D9E 20260720 @@claudeCode
    this.devProjects = [];
    this.devProjectsCachedAt = 0;
    this.regions = [];
    this.regionsCachedAt = 0;
    this.dictValuesByCode.clear();
    // @AI-End C6D9E 20260720 @@claudeCode
  }
  // @AI-End X9N7P 20260518 @@cc
}
