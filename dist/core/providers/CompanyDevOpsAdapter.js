"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyDevOpsAdapter = void 0;
const AppError_1 = require("../AppError");
const http_1 = require("../http");
const DEVOPS_BASE_URL = 'https://devops.ctjsoft.com';
const DEVOPS_PAGE_ID = 'h7BdNkJ';
// @AI-Begin C6D9E 20260720 @@claudeCode
const DEVOPS_DEV_TASK_PAGE_ID = 'AbY8d4R';
const DEVOPS_DEV_TASK_TOP_MENU_ID = 'DevPro';
// @AI-End C6D9E 20260720 @@claudeCode
// @AI-Begin K1L2M 20260809 @@claudeCode — 日报专用 pageId
const DEVOPS_DAILY_PAGE_ID = 'wlrFlaF';
// @AI-End K1L2M 20260809 @@claudeCode
const DEVOPS_TOP_MENU_ID = 'OA';
const DEVOPS_GROUP_ID = '1';
class CompanyDevOpsAdapter {
    options;
    name = 'Company DevOps';
    session;
    constructor(options) {
        this.options = options;
    }
    async fetchProjects() {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/commonQuery/query/product/listByUserRight`);
        url.searchParams.set('userId', session.userId);
        url.searchParams.set('pageId', DEVOPS_PAGE_ID);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: {
                cookie: session.cookie,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            }
        });
        const projects = collectProductItems(response)
            .map(toProject)
            .filter((project) => project.code && project.name);
        if (projects.length === 0) {
            throw new AppError_1.ProviderError(`${this.name} did not return any products for this user.`, undefined, this.name);
        }
        return projects;
    }
    // @AI-Begin K3M8Q 20260606 @@claudeCode
    async fetchTasks(type) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const configFlag = type === 'task' ? 'Task' : 'Bug';
        const tasktypeId = type === 'task' ? 'asbdbfkwef' : 'uoyDMdta';
        // Step 1: 发现分组 — 获取当前用户的 executeUser groupFieldValue 和 groupTaskCount
        const step1Body = {
            current: '1',
            size: '50',
            simpleFieldCondition: {
                topMenuId: DEVOPS_TOP_MENU_ID,
                pageId: DEVOPS_PAGE_ID,
                currentUser: session.userId,
                currentProductId: 'undefined',
                configFlag,
                tasktypeId: [tasktypeId],
                executeUser: [session.userId],
                progressStatus: 'incomplete',
                taskTypeQueryRule: '0'
            },
            groupId: '6'
        };
        log(`[fetchTasks] Step1 URL: ${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`);
        log(`[fetchTasks] Step1 body: ${JSON.stringify(step1Body)}`);
        const step1Raw = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            },
            body: JSON.stringify(step1Body)
        });
        log(`[fetchTasks] Step1 raw typeof: ${typeof step1Raw}  isArray: ${Array.isArray(step1Raw)}`);
        log(`[fetchTasks] Step1 raw (first 3000 chars): ${JSON.stringify(step1Raw).slice(0, 3000)}`);
        const step1Arr = Array.isArray(step1Raw) ? step1Raw : step1Raw.data ?? [];
        log(`[fetchTasks] Step1 arr.length: ${step1Arr.length}`);
        const EXECUTE_USER_RE = /^executeUser\d{4}\$/;
        let matchedGroupValue = '';
        let groupTaskCount = 5;
        for (const item of step1Arr) {
            const record = item;
            const gfv = record.groupFieldValue;
            if (typeof gfv === 'string' && EXECUTE_USER_RE.test(gfv)) {
                matchedGroupValue = gfv;
                log(`[fetchTasks] Step1 matched groupFieldValue: ${gfv}`);
                if (typeof record.groupTaskCount === 'number') {
                    groupTaskCount = record.groupTaskCount;
                }
                else if (typeof record.groupTaskCount === 'string') {
                    const parsed = parseInt(record.groupTaskCount, 10);
                    if (!isNaN(parsed)) {
                        groupTaskCount = parsed;
                    }
                }
                log(`[fetchTasks] Step1 groupTaskCount: ${groupTaskCount}`);
                break;
            }
        }
        if (!matchedGroupValue) {
            log('[fetchTasks] Step1 failed: no groupFieldValue matched executeUser pattern. Step1 items dump:');
            for (const item of step1Arr) {
                log(`  item keys: ${Object.keys(item).join(', ')}  gfv: ${item.groupFieldValue}`);
            }
            return [];
        }
        // Step 2: 用发现的 group 查询实际任务列表
        const step2Body = {
            simpleFieldCondition: {
                topMenuId: DEVOPS_TOP_MENU_ID,
                pageId: DEVOPS_PAGE_ID,
                currentUser: session.userId,
                currentProductId: 'undefined',
                configFlag,
                tasktypeId: [tasktypeId],
                executeUser: [session.userId],
                parentId: matchedGroupValue,
                taskTypeQueryRule: '0',
                progressStatus: 'incomplete'
            },
            groupId: '6',
            groupField: 'executeUser',
            groupFieldValue: matchedGroupValue,
            parentGroupInfos: [],
            groupTaskCount
        };
        log(`[fetchTasks] Step2 body: ${JSON.stringify(step2Body)}`);
        const step2Raw = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            },
            body: JSON.stringify(step2Body)
        });
        log(`[fetchTasks] Step2 raw typeof: ${typeof step2Raw}  isArray: ${Array.isArray(step2Raw)}`);
        if (!Array.isArray(step2Raw)) {
            log(`[fetchTasks] Step2 raw keys: ${Object.keys(step2Raw).join(', ')}`);
        }
        log(`[fetchTasks] Step2 raw (first 3000 chars): ${JSON.stringify(step2Raw).slice(0, 3000)}`);
        const arr = Array.isArray(step2Raw) ? step2Raw : step2Raw.data ?? [];
        log(`[fetchTasks] Step2 arr.length: ${arr.length}`);
        if (arr.length > 0) {
            log(`[fetchTasks] Step2 arr[0] keys: ${Object.keys(arr[0]).join(', ')}`);
            log(`[fetchTasks] Step2 arr[0]: ${JSON.stringify(arr[0]).slice(0, 2000)}`);
        }
        const result = arr
            .map((item) => this.toTask(item, type))
            .filter((task) => task.code && task.title);
        log(`[fetchTasks] Final result count: ${result.length}`);
        return result;
    }
    // @AI-End K3M8Q 20260606 @@claudeCode
    // @AI-Begin A8B3C 20260807 @@claudeCode
    async fetchTasksByProduct(devprojId, prodId) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const baseCondition = {
            topMenuId: DEVOPS_DEV_TASK_TOP_MENU_ID,
            pageId: DEVOPS_DEV_TASK_PAGE_ID,
            currentUser: session.userId,
            currentProductId: 'undefined',
            configFlag: 'Task',
            progressStatus: '',
            taskTypeQueryRule: '0',
            devprojId: [devprojId],
            prodId: [prodId]
        };
        const headers = {
            'content-type': 'application/json',
            cookie: session.cookie,
            origin: DEVOPS_BASE_URL,
            'user-context': JSON.stringify({
                userId: session.userId,
                pageId: DEVOPS_DEV_TASK_PAGE_ID
            })
        };
        // ── Step 1: 获取时间分组摘要 ──
        const step1Body = {
            current: '1',
            size: '50',
            simpleFieldCondition: baseCondition,
            groupId: '1'
        };
        log(`[fetchTasksByProduct] Step1 group summaries`);
        const step1Raw = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers,
            body: JSON.stringify(step1Body)
        });
        const groups = (step1Raw.data ?? []);
        log(`[fetchTasksByProduct] Step1 got ${groups.length} groups`);
        if (groups.length === 0) {
            return [];
        }
        // ── 筛选本周分组 ──
        const { weekStart, weekEnd } = getCurrentWeekRange();
        // 本周日期集合（yyyy-MM-dd），包含周一到今天
        const weekDates = new Set();
        {
            const d = new Date(weekStart);
            const today = new Date().toISOString().split('T')[0];
            while (d.toISOString().split('T')[0] <= today) {
                weekDates.add(d.toISOString().split('T')[0]);
                d.setDate(d.getDate() + 1);
            }
        }
        log(`[fetchTasksByProduct] week dates: ${[...weekDates].join(', ')}`);
        const tasksPerGroup = [];
        for (const group of groups) {
            const groupName = String(group.groupName ?? '');
            const groupFieldValue = String(group.groupFieldValue ?? '');
            const groupTaskCount = Number(group.groupTaskCount) || 0;
            if (!groupFieldValue || groupTaskCount <= 0) {
                continue;
            }
            // 判断是否属于本周：名称以"今天"或"昨天"开头，或日期在本周范围内
            const dateMatch = groupName.match(/^(\d{4}-\d{2}-\d{2})/);
            const isToday = groupName.startsWith('今天');
            const isYesterday = groupName.startsWith('昨天');
            const isWeekDate = dateMatch && weekDates.has(dateMatch[1]);
            if (!isToday && !isYesterday && !isWeekDate) {
                log(`[fetchTasksByProduct] skip group: ${groupName}`);
                continue;
            }
            log(`[fetchTasksByProduct] expand group: ${groupName} (${groupTaskCount} tasks)`);
            // ── Step 2: 展开分组获取具体 Task ──
            const step2Body = {
                simpleFieldCondition: {
                    ...baseCondition,
                    parentId: groupFieldValue
                },
                groupId: '1',
                groupField: 'createTime',
                groupFieldValue,
                parentGroupInfos: [],
                groupTaskCount
            };
            tasksPerGroup.push((0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`, {
                method: 'POST',
                timeoutMs: this.options.timeoutMs,
                headers,
                body: JSON.stringify(step2Body)
            }).then((raw) => {
                const arr = raw.data ?? [];
                log(`[fetchTasksByProduct] Step2 group ${groupName} returned ${arr.length} tasks`);
                return arr
                    .map((item) => this.toTask(item, 'task'))
                    .filter((task) => task.code && task.title);
            }).catch((err) => {
                log(`[fetchTasksByProduct] Step2 group ${groupName} failed: ${err instanceof Error ? err.message : String(err)}`);
                return [];
            }));
        }
        // ── 等所有分组展开完毕，合并 ──
        const results = await Promise.all(tasksPerGroup);
        const seen = new Set();
        const allTasks = [];
        for (const tasks of results) {
            for (const task of tasks) {
                if (!seen.has(task.code)) {
                    seen.add(task.code);
                    allTasks.push(task);
                }
            }
        }
        log(`[fetchTasksByProduct] total tasks: ${allTasks.length} codes=${allTasks.map((t) => t.code).join(', ')}`);
        return allTasks;
    }
    // @AI-End A8B3C 20260807 @@claudeCode
    // @AI-Begin M7N8K 20260605 @@claudeCode
    async fetchTaskByCode(code, type) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const configFlag = type === 'task' ? 'Task' : 'Bug';
        // Step 1: 先调 group 列表接口，传入用户输入的编号作为 params
        const step1Body = {
            current: '1',
            size: '50',
            simpleFieldCondition: {
                topMenuId: DEVOPS_TOP_MENU_ID,
                pageId: DEVOPS_PAGE_ID,
                currentUser: session.userId,
                currentProductId: 'undefined',
                configFlag,
                progressStatus: 'incomplete',
                taskTypeQueryRule: '0',
                params: code
            },
            groupId: '6'
        };
        log(`[fetchTaskByCode] Step1 URL: ${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`);
        log(`[fetchTaskByCode] Step1 body: ${JSON.stringify(step1Body)}`);
        const step1Raw = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            },
            body: JSON.stringify(step1Body)
        });
        log(`[fetchTaskByCode] Step1 raw typeof: ${typeof step1Raw}  isArray: ${Array.isArray(step1Raw)}`);
        log(`[fetchTaskByCode] Step1 raw (first 3000 chars): ${JSON.stringify(step1Raw).slice(0, 3000)}`);
        // 从 Step1 返回值中找到 executeUser 开头 + 4位数字 + $ 的 groupFieldValue
        // 例如: executeUser7001$1684128268312203265
        const step1Arr = Array.isArray(step1Raw) ? step1Raw : step1Raw.data ?? [];
        log(`[fetchTaskByCode] Step1 arr.length: ${step1Arr.length}`);
        const EXECUTE_USER_RE = /^executeUser\d{4}\$/;
        let matchedGroupValue = '';
        for (const item of step1Arr) {
            const gfv = item.groupFieldValue;
            if (typeof gfv === 'string' && EXECUTE_USER_RE.test(gfv)) {
                matchedGroupValue = gfv;
                log(`[fetchTaskByCode] Step1 matched groupFieldValue: ${gfv}`);
                break;
            }
        }
        if (!matchedGroupValue) {
            log('[fetchTaskByCode] Step1 failed: no groupFieldValue matched executeUser pattern');
            return null;
        }
        // Step 2: 用匹配到的 groupFieldValue 查询具体 task/bug
        const step2Body = {
            simpleFieldCondition: {
                topMenuId: DEVOPS_TOP_MENU_ID,
                pageId: DEVOPS_PAGE_ID,
                currentUser: session.userId,
                currentProductId: 'undefined',
                configFlag,
                parentId: matchedGroupValue,
                taskTypeQueryRule: '0',
                ...(type === 'task' ? { taskNo: code } : { problemNo: code })
            },
            groupId: '6',
            groupField: 'executeUser',
            groupFieldValue: matchedGroupValue,
            parentGroupInfos: [],
            groupTaskCount: 5
        };
        log(`[fetchTaskByCode] Step2 body: ${JSON.stringify(step2Body)}`);
        const step2Raw = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/loadTaskListWithGroup`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            },
            body: JSON.stringify(step2Body)
        });
        log(`[fetchTaskByCode] Step2 raw typeof: ${typeof step2Raw}  isArray: ${Array.isArray(step2Raw)}`);
        if (!Array.isArray(step2Raw)) {
            log(`[fetchTaskByCode] Step2 raw keys: ${Object.keys(step2Raw).join(', ')}`);
        }
        log(`[fetchTaskByCode] Step2 raw (first 2000 chars): ${JSON.stringify(step2Raw).slice(0, 2000)}`);
        const arr = Array.isArray(step2Raw) ? step2Raw : step2Raw.data ?? [];
        log(`[fetchTaskByCode] Step2 arr.length: ${arr.length}`);
        if (arr.length === 0) {
            return null;
        }
        log(`[fetchTaskByCode] Step2 arr[0] keys: ${Object.keys(arr[0]).join(', ')}`);
        log(`[fetchTaskByCode] Step2 arr[0]: ${JSON.stringify(arr[0]).slice(0, 2000)}`);
        return this.toTask(arr[0], type);
    }
    // @AI-End M7N8K 20260605 @@claudeCode
    async testConnection() {
        await this.getSession();
        return true;
    }
    async addWorkHour(taskId, createTime, spendTaskTime, dayCompletion, workContent, taskWorkhourType) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const payload = { createTime, taskWorkhourType, spendTaskTime, dayCompletion, workContent, taskId, createUser: session.userId };
        log(`[addWorkHour] payload: ${JSON.stringify(payload)}`);
        const response = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/add/addWorkHour`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            },
            body: JSON.stringify(payload)
        });
        log(`[addWorkHour] response: ${JSON.stringify(response)}`);
        if (response.status_code !== '0000') {
            throw new AppError_1.ProviderError(response.reason ?? '登记工时失败', undefined, this.name);
        }
    }
    // @AI-Begin D3E4F 20260518 @@cc
    async fetchWorkHours(taskId) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/workHour/list`);
        url.searchParams.set('taskId', taskId);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: {
                cookie: session.cookie,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            }
        });
        return response.data ?? [];
    }
    // @AI-End D3E4F 20260518 @@cc
    // @AI-Begin K9L2M 20260521 @@cc
    async fetchWorkHourTypes() {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/run/dictValue/query/queryDictValueByCode`);
        url.searchParams.set('eleCatalogCode', 'taskWorkhourType');
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: {
                cookie: session.cookie,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            }
        });
        return (response.data ?? []).filter((item) => item.eleCode && item.eleName);
    }
    // @AI-End K9L2M 20260521 @@cc
    // @AI-Begin G5H6I 20260518 @@cc
    async modifyWorkHour(taskWorkhourId, taskId, createTime, spendTaskTime, dayCompletion, workContent, taskWorkhourType) {
        const session = await this.getSession();
        const response = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/v3/task/modify/modifyWorkHour`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_PAGE_ID
                })
            },
            body: JSON.stringify({
                createTime,
                taskWorkhourType: taskWorkhourType,
                spendTaskTime,
                dayCompletion,
                workContent,
                taskId,
                taskWorkhourId,
                updateUser: session.userId
            })
        });
        if (response.status_code !== '0000') {
            throw new AppError_1.ProviderError(response.reason ?? '修改工时失败', undefined, this.name);
        }
    }
    // @AI-End G5H6I 20260518 @@cc
    // @AI-Begin C6D9E 20260720 @@claudeCode
    async getUserId() {
        const session = await this.getSession();
        return session.userId;
    }
    async createTask(input) {
        const session = await this.getSession();
        const today = new Date().toISOString().split('T')[0];
        const payload = {
            workSource: input.workSource,
            taskWorkItemCatalog: input.taskWorkItemCatalog ?? '3',
            importance: input.importance,
            priority: input.priority,
            ecDate: input.ecDate || today,
            devprojId: input.devprojId,
            prodId: input.prodId,
            regionId: input.regionId,
            opsprojId: input.opsprojId,
            executeUser: input.executeUser,
            planStartTime: input.planStartTime || today,
            planEndTime: input.planEndTime || today,
            planTaskTime: input.planTaskTime,
            executeTaskTime: '0',
            presenter: session.userId,
            projectId: DEVOPS_DEV_TASK_TOP_MENU_ID,
            bugLevel: '1',
            tasktypeId: 'asbdbfkwef',
            planDetailIds: [],
            isChildrenWork: false,
            taskName: input.taskName,
            taskRemark: input.taskRemark ?? '',
            tasktypeCode: 'Task',
            tasktypeName: '任务',
            attachIdList: [],
            taskRemarkIsChange: true,
            createUser: session.userId,
            updateUser: session.userId,
            topMenuId: DEVOPS_DEV_TASK_TOP_MENU_ID,
            taskAttachIds: []
        };
        const log = this.options.log ?? (() => { });
        // moduleId / prodVersionId：未指定时自动查询默认值
        payload.moduleId = input.moduleId || '';
        if (input.prodVersionId) {
            payload.prodVersionId = input.prodVersionId;
        }
        else {
            try {
                const versions = await this.fetchProductVersions(input.prodId);
                const defaultVersion = versions[0];
                payload.prodVersionId = defaultVersion?.id ?? '';
                log(`[createTask] auto-resolved prodVersionId: ${payload.prodVersionId} (from ${versions.length} versions)`);
            }
            catch {
                payload.prodVersionId = '';
                log('[createTask] failed to auto-resolve prodVersionId');
            }
        }
        const url = `${DEVOPS_BASE_URL}/devops-server/config/v3/task/add/task`;
        log(`[createTask] URL: ${url}`);
        log(`[createTask] payload: ${JSON.stringify(payload)}`);
        const response = await (0, http_1.fetchJson)(this.name, url, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_DEV_TASK_PAGE_ID
                })
            },
            body: JSON.stringify(payload)
        });
        log(`[createTask] response: ${JSON.stringify(response)}`);
        if (response.status_code !== '0000') {
            throw new AppError_1.ProviderError(response.reason ?? '创建任务失败', undefined, this.name);
        }
        // response.data is an array like [{taskId, taskNo, ...}], grab the first element
        const rawData = response.data;
        const data = (Array.isArray(rawData) && rawData.length > 0)
            ? rawData[0]
            : (!Array.isArray(rawData) ? (rawData ?? {}) : {});
        const code = String(data.taskNo ?? data.code ?? '');
        return {
            code,
            title: input.taskName,
            id: String(data.taskId ?? data.id ?? code),
            url: data.url
        };
    }
    async fetchDevProjects() {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/commonQuery/query/devPro/list`);
        url.searchParams.set('appId', DEVOPS_DEV_TASK_TOP_MENU_ID);
        url.searchParams.set('pageId', DEVOPS_DEV_TASK_PAGE_ID);
        url.searchParams.set('userId', session.userId);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.devTaskUserContextHeaders(session)
        });
        return (response.data ?? []).filter((p) => p.devprojId && p.devprojCname);
    }
    async fetchProductsByProject(devprojId) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/commonQuery/query/product/list`);
        url.searchParams.set('appId', DEVOPS_DEV_TASK_TOP_MENU_ID);
        url.searchParams.set('proId', devprojId);
        url.searchParams.set('pageId', DEVOPS_DEV_TASK_PAGE_ID);
        url.searchParams.set('userId', session.userId);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.devTaskUserContextHeaders(session)
        });
        return (response.data ?? []).filter((p) => p.prodId && p.prodCname);
    }
    async fetchRegions() {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/commonQuery/query/region/list`);
        url.searchParams.set('appId', DEVOPS_DEV_TASK_TOP_MENU_ID);
        url.searchParams.set('pageId', DEVOPS_DEV_TASK_PAGE_ID);
        url.searchParams.set('userId', session.userId);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.devTaskUserContextHeaders(session)
        });
        return (response.data ?? []).filter((r) => r.regionId && r.regionName);
    }
    async fetchOpsProjectsByRegion(regionId) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/commonQuery/query/opsProByRegion/list`);
        url.searchParams.set('appId', DEVOPS_DEV_TASK_TOP_MENU_ID);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_DEV_TASK_PAGE_ID
                })
            },
            body: JSON.stringify([regionId])
        });
        return (response.data ?? []).filter((o) => o.opsprojId && o.opsprojCname);
    }
    async fetchExecuteUsers(productId) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/executeUser/list`);
        url.searchParams.set('type', DEVOPS_DEV_TASK_TOP_MENU_ID);
        url.searchParams.set('taskProductId', '');
        url.searchParams.set('productId', productId ?? '');
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.devTaskUserContextHeaders(session)
        });
        return (response.data ?? []).filter((u) => u.id && u.name);
    }
    async fetchProductVersions(productId) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/proVersion/list`);
        url.searchParams.set('productId', productId);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.devTaskUserContextHeaders(session)
        });
        return (response.data ?? []).filter((v) => v.id && v.name);
    }
    async fetchModules(productId) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/v3/task/query/moduleList`);
        url.searchParams.set('prodId', productId);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_DEV_TASK_PAGE_ID
                })
            },
            body: JSON.stringify({})
        });
        return (response.data ?? []).filter((m) => m.moduleId && m.moduleName);
    }
    async fetchDictValues(catalogCode) {
        const session = await this.getSession();
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/run/dictValue/query/queryDictValueByCode`);
        url.searchParams.set('eleCatalogCode', catalogCode);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.devTaskUserContextHeaders(session)
        });
        return (response.data ?? []).filter((d) => d.eleCode && d.eleName);
    }
    // @AI-Begin K1L2M 20260809 @@claudeCode — 日报 API 方法
    dailyHeaders(session) {
        return {
            cookie: session.cookie,
            'user-context': JSON.stringify({
                userId: session.userId,
                pageId: DEVOPS_DAILY_PAGE_ID
            })
        };
    }
    async fetchTodayWork(reportDate) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/query/loadTodayWork`);
        url.searchParams.set('userId', session.userId);
        url.searchParams.set('reportDate', reportDate);
        log(`[fetchTodayWork] url: ${url.toString()}`);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.dailyHeaders(session)
        });
        const rawTree = response.data ?? [];
        const total = extractTotalHours(rawTree);
        const sumNode = rawTree.find((n) => n.id === 'sumTime');
        return {
            totalHours: total,
            totalHoursText: sumNode?.text ?? `当日工时合计：${total}h`,
            rawTree
        };
    }
    async fetchTomorrowPlan() {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/query/loadTomorrowWork`);
        url.searchParams.set('userId', session.userId);
        log(`[fetchTomorrowPlan] url: ${url.toString()}`);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.dailyHeaders(session)
        });
        return response.data ?? '';
    }
    async checkTodayWorkHourEnough(reportDate) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/query/checkTodayWorkHourEnough`);
        url.searchParams.set('userId', session.userId);
        url.searchParams.set('reportDate', reportDate);
        log(`[checkTodayWorkHourEnough] url: ${url.toString()}`);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.dailyHeaders(session)
        });
        return response.data ?? '0';
    }
    async checkOverdueTasks() {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const url = new URL(`${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/query/checkOverdueTask`);
        url.searchParams.set('userId', session.userId);
        log(`[checkOverdueTasks] url: ${url.toString()}`);
        const response = await (0, http_1.fetchJson)(this.name, url.toString(), {
            timeoutMs: this.options.timeoutMs,
            headers: this.dailyHeaders(session)
        });
        return {
            total: response.data?.overdueTotal ?? 0,
            title: response.data?.overdueTitle ?? ''
        };
    }
    async submitDailyReport(input) {
        const session = await this.getSession();
        const log = this.options.log ?? (() => { });
        const payload = {
            nextPlan: input.nextPlan,
            nowWork: input.nowWork,
            otherMatters: input.otherMatters,
            reportType: '1',
            toUserIds: input.toUserIds,
            createUser: session.userId,
            reportDate: input.reportDate,
            fileIds: []
        };
        log(`[submitDailyReport] payload size: ${JSON.stringify(payload).length} bytes`);
        const response = await (0, http_1.fetchJson)(this.name, `${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/add`, {
            method: 'POST',
            timeoutMs: this.options.timeoutMs,
            headers: {
                'content-type': 'application/json',
                cookie: session.cookie,
                origin: DEVOPS_BASE_URL,
                'user-context': JSON.stringify({
                    userId: session.userId,
                    pageId: DEVOPS_DAILY_PAGE_ID
                })
            },
            body: JSON.stringify(payload)
        });
        log(`[submitDailyReport] response: status_code=${response.status_code}, reason=${response.reason}`);
        if (response.status_code !== '0000') {
            throw new AppError_1.ProviderError(response.reason ?? '提交日报失败', undefined, this.name);
        }
    }
    // @AI-End K1L2M 20260809 @@claudeCode
    devTaskUserContextHeaders(session) {
        return {
            cookie: session.cookie,
            'user-context': JSON.stringify({
                userId: session.userId,
                pageId: DEVOPS_DEV_TASK_PAGE_ID
            })
        };
    }
    // @AI-End C6D9E 20260720 @@claudeCode
    async getSession() {
        if (this.session) {
            return this.session;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
        try {
            const form = new FormData();
            form.set('version', '3.0');
            form.set('loginType', 'password');
            form.set('username', this.options.username);
            form.set('password', this.options.password);
            form.set('region', '');
            form.set('year', String(new Date().getFullYear()));
            const response = await fetch(`${DEVOPS_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    accept: 'application/json, text/plain, */*',
                    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'cache-control': 'no-cache',
                    origin: DEVOPS_BASE_URL,
                    pragma: 'no-cache',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
                    'user-context': JSON.stringify({
                        userId: '',
                        userCode: '',
                        userName: 'undefined',
                        appId: '',
                        appCode: '',
                        busiYear: '',
                        tenantId: '',
                        pageId: ''
                    })
                },
                body: form,
                signal: controller.signal
            });
            if (!response.ok) {
                throw new AppError_1.ProviderError(`${(0, http_1.readableHttpError)(this.name, response.status)} If the web login encrypts the password, re-run initialization and paste the captured login password field value.`, response.status, this.name);
            }
            const text = await response.text();
            const body = (0, http_1.parseResponsePayload)(this.name, text);
            const cookie = parseCookieHeaders(readSetCookieHeaders(response.headers));
            const userId = findDeepString(body, ['userId']);
            if (!cookie) {
                throw new AppError_1.ProviderError(`${this.name} login did not return session cookies.`, undefined, this.name);
            }
            if (!userId) {
                throw new AppError_1.ProviderError('登录成功，但登录响应中没有找到 userId。请把登录响应结构脱敏后发我，我来补字段映射。', undefined, this.name);
            }
            this.session = { cookie, userId };
            return this.session;
        }
        catch (error) {
            if (error instanceof AppError_1.ProviderError) {
                throw error;
            }
            if (error instanceof Error && error.name === 'AbortError') {
                throw new AppError_1.ProviderError(`${this.name} login timed out.`, undefined, this.name);
            }
            throw new AppError_1.ProviderError(`${this.name} login failed: ${error instanceof Error ? error.message : String(error)}`, undefined, this.name);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    // @AI-Begin R2S5T 20260519 @@cc
    toTask(task, type) {
        const code = String(task.taskNo ?? task.problemNo ?? task.taskId ?? '');
        const title = String(task.taskName ?? task.title ?? task.name ?? task.taskNo ?? code);
        return {
            code,
            title,
            type,
            status: String(task.implementStatus ?? task.status ?? task.progressStatus ?? 'incomplete'),
            projectCode: String(task.prodId ?? task.projectCode ?? ''),
            projectName: typeof task.prodName === 'string' ? task.prodName : undefined,
            estimatedHours: toOptionalString(task.planTaskTime),
            usedHours: toOptionalString(task.devWorkload ??
                task.proWorkload ??
                task.executeTaskTime),
            currentProgress: toOptionalString(task.completion ?? task.groupTaskSumCompletion),
            url: typeof task.url === 'string' ? task.url : undefined,
            id: String(task.taskId ?? task.id ?? code),
            // @AI-Begin A8B3C 20260807 @@claudeCode
            regionId: typeof task.regionId === 'string' ? task.regionId : undefined,
            regionName: typeof task.regionName === 'string' ? task.regionName : undefined,
            opsprojId: typeof task.opsprojId === 'string' ? task.opsprojId : undefined,
            opsprojName: typeof task.opsprojName === 'string' ? task.opsprojName : undefined,
            createTime: typeof task.createTime === 'string' ? task.createTime : undefined,
            executeUserName: typeof task.executeUserName === 'string' ? task.executeUserName : undefined,
            // @AI-End A8B3C 20260807 @@claudeCode
        };
    }
}
exports.CompanyDevOpsAdapter = CompanyDevOpsAdapter;
function toOptionalString(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    return String(value).replace(/%$/, '');
}
function readSetCookieHeaders(headers) {
    const withGetSetCookie = headers;
    const cookies = withGetSetCookie.getSetCookie?.();
    if (cookies?.length) {
        return cookies;
    }
    const combined = headers.get('set-cookie');
    return combined ? [combined] : [];
}
function parseCookieHeaders(setCookies) {
    if (setCookies.length === 0) {
        return '';
    }
    return setCookies
        .flatMap((header) => header.split(/,(?=\s*[^;,]+=)/))
        .map((cookie) => cookie.split(';')[0]?.trim())
        .filter(Boolean)
        .join('; ');
}
function findDeepString(value, keys) {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const record = value;
    for (const key of keys) {
        const found = record[key];
        if (typeof found === 'string' && found) {
            return found;
        }
        if (typeof found === 'number') {
            return String(found);
        }
    }
    for (const child of Object.values(record)) {
        const found = findDeepString(child, keys);
        if (found) {
            return found;
        }
    }
    return undefined;
}
function collectProductItems(value) {
    const items = [];
    collectProductObjects(value, items);
    return items.filter((item) => Boolean(item.prodId ?? item.productId ?? item.prodCode ?? item.code ?? item.id));
}
function toProject(product) {
    const code = product.prodId ?? product.productId ?? product.prodCode ?? product.code ?? product.id ?? '';
    const name = product.prodCname ?? code;
    return {
        code: String(code),
        name: String(name)
    };
}
function collectProductObjects(value, items) {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectProductObjects(item, items);
        }
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }
    const record = value;
    if (record.prodId || record.productId || record.prodCode || record.code || record.id) {
        items.push(record);
    }
    for (const child of Object.values(record)) {
        collectProductObjects(child, items);
    }
}
function collectTaskItems(value) {
    const items = [];
    collectTaskObjects(value, items);
    return items.filter((item) => Boolean(item.taskNo ?? item.problemNo ?? item.code ?? item.taskCode ?? item.bugCode ?? item.taskId ?? item.id));
}
function collectTaskObjects(value, items) {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectTaskObjects(item, items);
        }
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }
    const record = value;
    if (record.taskNo || record.problemNo || record.code || record.taskCode || record.bugCode || record.taskId || record.id) {
        items.push(record);
    }
    for (const child of Object.values(record)) {
        collectTaskObjects(child, items);
    }
}
// @AI-Begin A8B3C 20260807 @@claudeCode
/** 获取当前自然周范围（周一 ～ 周日），返回 yyyy-MM-dd 格式字符串。 */
function getCurrentWeekRange() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
    // 计算周一的偏移：如果今天是周日(0)，周一在6天前；否则周一在 (dayOfWeek-1) 天前
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const fmt = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };
    return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}
// @AI-End A8B3C 20260807 @@claudeCode
// @AI-Begin K1L2M 20260809 @@claudeCode
/** 从 loadTodayWork 返回的树形数据中提取工时合计（小时） */
function extractTotalHours(tree) {
    const sumNode = tree.find((n) => n?.id === 'sumTime');
    if (!sumNode?.text) {
        return 0;
    }
    const match = sumNode.text.match(/([\d.]+)\s*h/i);
    return match ? parseFloat(match[1]) : 0;
}
// @AI-End K1L2M 20260809 @@claudeCode
//# sourceMappingURL=CompanyDevOpsAdapter.js.map