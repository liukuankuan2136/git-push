export type DevOpsTaskType = 'task' | 'bug';

export interface DevOpsProject {
  code: string;
  name: string;
}

// @AI-Begin R2S5T 20260519 @@cc
export interface DevOpsTask {
  code: string;
  title: string;
  type: DevOpsTaskType;
  status: string;
  projectCode: string;
  projectName?: string;
  estimatedHours?: string;
  usedHours?: string;
  currentProgress?: string;
  url?: string;
  id?: string;
}
// @AI-End R2S5T 20260519 @@cc

// @AI-Begin A1B2C 20260518 @@cc
export interface WorkHourRecord {
  taskWorkhourId: string;
  spendTaskTime: number;
  workContent: string;
  taskWorkhourDate: string;
  dayCompletion: string;
}
// @AI-End A1B2C 20260518 @@cc

// @AI-Begin Z9Y8X 20260521 @@cc
export interface WorkHourType {
  eleId: string;
  eleCode: string;
  eleName: string;
}
// @AI-End Z9Y8X 20260521 @@cc

// @AI-Begin C6D9E 20260720 @@claudeCode
export interface DevProject {
  devprojId: string;
  devprojCname: string;
}

export interface Product {
  prodId: string;
  prodCname: string;
}

export interface Region {
  regionId: string;
  regionName: string;
}

export interface OpsProject {
  opsprojId: string;
  opsprojCname: string;
}

export interface ProductVersion {
  id: string;
  name: string;
}

export interface ExecuteUser {
  id: string;
  code: string;
  name: string;
}

export interface DictValue {
  eleId: string;
  eleCode: string;
  eleName: string;
}

export interface Module {
  moduleId: string;
  moduleName: string;
}

export interface CreateTaskInput {
  taskName: string;
  devprojId: string;
  prodId: string;
  regionId: string;
  opsprojId: string;
  executeUser: string;
  importance: string;
  priority: string;
  workSource: string;
  planTaskTime: number;
  planStartTime: string;
  planEndTime: string;
  ecDate: string;
  moduleId?: string;
  prodVersionId?: string;
  taskRemark?: string;
}

export interface CreateTaskResult {
  code: string;
  title: string;
  id: string;
  url?: string;
}
// @AI-End C6D9E 20260720 @@claudeCode

export interface DevOpsCommitMetadata {
  project: DevOpsProject;
  task: DevOpsTask;
  commitType: string;
  subject: string;
  hours: string;
  progress: string;
  // @AI-Begin A1B2C 20260518 @@cc
  todayWorkHour?: WorkHourRecord;
  // @AI-End A1B2C 20260518 @@cc
  // @AI-Begin W6V7U 20260521 @@cc
  workHourTypeCode: string;
  // @AI-End W6V7U 20260521 @@cc
  workHourTypeName: string;
}

export interface DevOpsProvider {
  readonly name: string;
  fetchProjects(): Promise<DevOpsProject[]>;
  fetchTasks(type: DevOpsTaskType): Promise<DevOpsTask[]>;
  testConnection(): Promise<boolean>;
  // @AI-Begin A1B2C 20260518 @@cc
  fetchWorkHours?(taskId: string): Promise<WorkHourRecord[]>;
  // @AI-End A1B2C 20260518 @@cc
  // @AI-Begin T5S4R 20260521 @@cc
  fetchWorkHourTypes?(): Promise<WorkHourType[]>;
  // @AI-End T5S4R 20260521 @@cc
  // @AI-Begin M7N8K 20260605 @@claudeCode
  /** 按编号查询单个 task/bug，不做所属人员过滤。未找到返回 null。 */
  fetchTaskByCode?(code: string, type: DevOpsTaskType): Promise<DevOpsTask | null>;
  // @AI-End M7N8K 20260605 @@claudeCode
  addWorkHour?(
    taskId: string,
    createTime: string,
    spendTaskTime: number,
    dayCompletion: string,
    workContent: string,
    taskWorkhourType: string
  ): Promise<void>;
  // @AI-Begin A1B2C 20260518 @@cc
  modifyWorkHour?(
    taskWorkhourId: string,
    taskId: string,
    createTime: string,
    spendTaskTime: number,
    dayCompletion: string,
    workContent: string,
    taskWorkhourType: string
  ): Promise<void>;
  // @AI-End A1B2C 20260518 @@cc
  // @AI-Begin C6D9E 20260720 @@claudeCode
  createTask?(input: CreateTaskInput): Promise<CreateTaskResult>;
  fetchDevProjects?(): Promise<DevProject[]>;
  fetchProductsByProject?(devprojId: string): Promise<Product[]>;
  fetchRegions?(): Promise<Region[]>;
  fetchOpsProjectsByRegion?(regionId: string): Promise<OpsProject[]>;
  fetchExecuteUsers?(productId?: string): Promise<ExecuteUser[]>;
  fetchProductVersions?(productId: string): Promise<ProductVersion[]>;
  fetchModules?(productId: string): Promise<Module[]>;
  fetchDictValues?(catalogCode: string): Promise<DictValue[]>;
  getUserId?(): Promise<string>;
  // @AI-End C6D9E 20260720 @@claudeCode
}
