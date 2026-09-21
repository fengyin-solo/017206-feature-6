/* ========================================
   数据源与快照管理
   - 每次刷新产出一份完整快照，提交后各模块统一渲染
   - 刷新失败时保留上一次完成的快照用于恢复
   ======================================== */

class DataStore {
    constructor() {
        // 当前已提交的快照（初始为内置种子数据）
        this.current = DataStore.buildSnapshot();
    }

    // 由种子数据构建一份全新快照（深拷贝，避免渲染层直接改到源数据）
    static buildSnapshot() {
        const clone = (value) => JSON.parse(JSON.stringify(value));
        return {
            stats: clone(statsData),
            matrix: clone(matrixData),
            quickWins: clone(quickWins),
            funnel: clone(funnelData),
            radar: clone(radarData),
            diagnostic: clone(diagnosticSummary),
            updatedAt: new Date()
        };
    }

    // 上一次完成（已提交）的快照
    getSnapshot() {
        return this.current;
    }

    // 提交新快照
    commit(snapshot) {
        this.current = snapshot;
        return this.current;
    }

    /**
     * 模拟异步拉取一份快照
     * - 网络断开时立即失败
     * - 支持 AbortSignal 中断（如刷新中途断网）
     * - 超过 timeout 未返回判定为超时
     */
    fetchSnapshot({ timeout = 6000, signal } = {}) {
        return new Promise((resolve, reject) => {
            let latencyTimer = null;
            let timeoutTimer = null;

            const onAbort = () => fail('aborted');

            const cleanup = () => {
                clearTimeout(latencyTimer);
                clearTimeout(timeoutTimer);
                if (signal) signal.removeEventListener('abort', onAbort);
            };

            const fail = (reason) => {
                cleanup();
                reject(new Error(reason));
            };

            if (signal) {
                if (signal.aborted) {
                    fail('aborted');
                    return;
                }
                signal.addEventListener('abort', onAbort);
            }

            if (!navigator.onLine) {
                fail('offline');
                return;
            }

            // 模拟网络延迟 600~1400ms
            const latency = 600 + Math.random() * 800;
            latencyTimer = setTimeout(() => {
                cleanup();
                resolve(DataStore.buildSnapshot());
            }, latency);

            timeoutTimer = setTimeout(() => fail('timeout'), timeout);
        });
    }
}

// 创建全局实例
window.dataStore = new DataStore();
