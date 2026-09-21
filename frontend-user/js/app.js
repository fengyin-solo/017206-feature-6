/* ========================================
   应用主入口
   - 刷新是一条受控流程：ready(空闲) → refreshing(进行中) → ready(完成) / offline(断开)
   - 同一时刻只允许一个刷新请求；刷新中再次触发只排队一次，不会叠加
   - 网络断开或超时时保留上一次成功快照对应的界面，不做空渲染
   ======================================== */

const REFRESH_STATE = {
    READY: 'ready',           // 空闲，界面展示最近一次成功加载的数据
    REFRESHING: 'refreshing', // 有且仅有一个刷新流程在跑
    OFFLINE: 'offline'        // 最近一次刷新因断开/超时失败，界面保持上次成功状态
};

class App {
    constructor() {
        this.initialized = false;

        // 当前生效的数据快照（上一次“完成”状态的唯一事实来源）
        this.snapshot = window.dashboardDataSource.baseline();

        this.refreshState = REFRESH_STATE.READY;
        this.queuedRefresh = false; // 进行中再次触发 -> 排队，布尔合并（连点只算一次）
        this.abortController = null;

        this.scrollRaf = 0;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化组件与图表（均以当前快照为数据源）
        window.componentRenderer.init(this.snapshot);
        window.chartManager.init(this.snapshot);

        this.cacheElements();
        this.bindRefreshControls();
        this.bindConnectivity();
        this.bindScroll();

        // 初始即为一次“已完成”状态（内置基线数据）
        this.syncStatusUI();
        this.updateFooterTime();

        console.log('🚀 Dashboard initialized successfully');
    }

    cacheElements() {
        this.headerEl = document.querySelector('.header');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.refreshStatusDot = document.getElementById('refreshStatusDot');
        this.refreshStatusText = document.getElementById('refreshStatusText');
        this.footerTime = document.getElementById('footerTime');
    }

    bindRefreshControls() {
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.requestRefresh());
        }
    }

    // 浏览器连接状态：断网立即进入 offline；恢复在线时，若有待办则自动补跑一次
    bindConnectivity() {
        window.addEventListener('online', () => {
            if (this.refreshState === REFRESH_STATE.OFFLINE) {
                this.requestRefresh({ reason: 'reconnect' });
            } else {
                this.syncStatusUI();
            }
        });

        window.addEventListener('offline', () => {
            // 正在进行的请求立即中止，状态流转到 offline
            if (this.abortController) {
                this.abortController.abort();
            }
            this.setRefreshState(REFRESH_STATE.OFFLINE);
            this.syncStatusUI();
            window.toast.sticky('refresh', 'error', '网络已断开', '已保留上次更新的数据，网络恢复后自动重试');
        });
    }

    // 滚动：rAF 合流，每帧最多写一次样式
    bindScroll() {
        window.addEventListener('scroll', () => {
            if (this.scrollRaf) return;
            this.scrollRaf = requestAnimationFrame(() => {
                this.scrollRaf = 0;
                this.handleScroll();
            });
        }, { passive: true });
    }

    handleScroll() {
        const scrollY = window.scrollY;
        if (this.headerEl) {
            this.headerEl.style.opacity = Math.max(0.5, 1 - scrollY / 500);
        }
    }

    /**
     * 请求一次刷新（幂等入口）
     * - 空闲：立即开跑
     * - 进行中：登记一次排队，当前流程结束后自动补跑，连点多次也只补跑一次
     */
    requestRefresh(options = {}) {
        if (this.refreshState === REFRESH_STATE.REFRESHING) {
            if (!this.queuedRefresh) {
                this.queuedRefresh = true;
                window.toast.sticky('refresh', 'info', '刷新中', '本次刷新完成后将自动执行下一次…');
            }
            return;
        }
        this.runRefresh(options);
    }

    async runRefresh(options = {}) {
        this.queuedRefresh = false;
        this.abortController = new AbortController();

        this.setRefreshState(REFRESH_STATE.REFRESHING);
        this.syncStatusUI();
        window.toast.sticky('refresh', 'info', '刷新中', '正在从数据源重新加载…');

        try {
            const snapshot = await window.dashboardDataSource.fetchDashboard({
                signal: this.abortController.signal
            });

            // 唯一提交点：成功拿到完整快照后，三块内容 + 图表 + 侧栏一次性对齐数据源
            this.snapshot = snapshot;
            window.componentRenderer.renderAll(snapshot);
            window.chartManager.setData(snapshot);

            this.setRefreshState(REFRESH_STATE.READY);
            this.syncStatusUI();
            this.updateFooterTime();

            window.toast.sticky('refresh', 'success', '刷新完成', `数据已更新（${snapshot.updatedAt}）`);
            // 还有排队中的刷新时保留提示，下一轮直接复用同一条，避免两条 toast 重叠
            if (!this.queuedRefresh) {
                window.toast.dismissSticky('refresh', 2000);
            }

            console.info('[refresh] 快照已提交', snapshot);
        } catch (err) {
            if (err && err.name === 'RefreshError' && err.type === 'aborted') {
                // 被新请求/断网中止：不改变现有数据，交由排队或 offline 处理
            } else {
                this.handleRefreshFailure(err, options);
            }
        } finally {
            this.abortController = null;
        }

        // 排队的刷新请求：上一流程落定后只补跑一次；
        // 若期间已被打断到 OFFLINE（如刷新中断网），则等 online 事件再触发
        if (this.queuedRefresh && this.refreshState === REFRESH_STATE.READY) {
            this.queuedRefresh = false;
            this.runRefresh({ reason: 'queued' });
        }
        if (this.refreshState !== REFRESH_STATE.READY) {
            this.queuedRefresh = false;
        }
    }

    handleRefreshFailure(err, options = {}) {
        // 失败不触碰 DOM：界面继续展示 this.snapshot（上一次完成的数据）
        const isTimeout = err && err.name === 'RefreshError' && err.type === 'timeout';
        const reasonText = isTimeout
            ? '请求超时，当前展示的仍是上次更新的数据'
            : '网络连接失败，当前展示的仍是上次更新的数据';

        this.setRefreshState(REFRESH_STATE.OFFLINE);
        this.syncStatusUI();

        // 恢复网络后自动补跑的提示只在手动刷新失败时强调一次
        window.toast.sticky(
            'refresh',
            'error',
            isTimeout ? '刷新超时' : '刷新失败',
            options.reason === 'reconnect'
                ? `${reasonText}，请稍后手动重试`
                : `${reasonText}，网络恢复后将自动重试`
        );

        console.warn('[refresh] 刷新失败，已回退到上次成功快照', err);
    }

    setRefreshState(state) {
        this.refreshState = state;
    }

    // 头部刷新按钮 + 状态灯随流程状态切换
    syncStatusUI() {
        if (this.refreshBtn) {
            const refreshing = this.refreshState === REFRESH_STATE.REFRESHING;
            this.refreshBtn.disabled = refreshing;
            this.refreshBtn.classList.toggle('is-loading', refreshing);
            this.refreshBtn.classList.toggle('is-offline', this.refreshState === REFRESH_STATE.OFFLINE);
        }

        if (this.refreshStatusDot) {
            this.refreshStatusDot.dataset.state = this.refreshState;
        }
        if (this.refreshStatusText) {
            const labels = {
                [REFRESH_STATE.READY]: `已同步 · ${this.snapshot.updatedAt}`,
                [REFRESH_STATE.REFRESHING]: '刷新进行中…',
                [REFRESH_STATE.OFFLINE]: '连接断开 · 展示上次数据'
            };
            this.refreshStatusText.textContent = labels[this.refreshState];
        }
    }

    updateFooterTime() {
        if (this.footerTime) {
            this.footerTime.textContent = `数据更新时间: ${this.snapshot.updatedAt}`;
        }
    }

    // 导出报告
    exportReport() {
        window.toast.info('导出报告', '正在生成PDF报告...');

        setTimeout(() => {
            window.toast.success('导出成功', '报告已保存到下载目录');
        }, 2000);
    }
}

// 创建应用实例
const app = new App();

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// 暴露全局方法
window.app = app;
