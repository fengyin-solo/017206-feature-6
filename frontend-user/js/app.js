/* ========================================
   应用主入口
   - 刷新流程由 RefreshController 状态机统一调度
   - 窗口缩放与滚动分别经 ResizeObserver / rAF 节流处理
   ======================================== */

class App {
    constructor() {
        this.initialized = false;
        this.refreshController = null;
        this.resizeRaf = null;
        this.scrollTicking = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const snapshot = window.dataStore.getSnapshot();

        // 初始化组件（全部渲染自同一份快照）
        window.componentRenderer.init(snapshot);

        // 初始化图表
        window.chartManager.initFunnelChart('funnelChart', snapshot);
        window.chartManager.initRadarChart('radarChart', snapshot);

        // 刷新状态机：进行中 / 完成 / 断开
        this.refreshController = new RefreshController({
            store: window.dataStore,
            timeout: 6000,
            onRender: (snap) => this.renderAll(snap),
            onStateChange: (state, detail) => this.updateRefreshStatus(state, detail)
        });

        this.bindRefreshButton();
        this.bindResize();
        this.bindScroll();

        // 初始状态展示
        this.updateRefreshStatus('idle', { updatedAt: snapshot.updatedAt });
        this.updateFooterTime(snapshot.updatedAt);

        console.log('🚀 Dashboard initialized successfully');
    }

    /* ---------- 统一渲染：三块内容 + 图表 + 侧栏均来自同一快照 ---------- */
    renderAll(snapshot) {
        window.componentRenderer.renderStats(snapshot);
        window.componentRenderer.renderMatrix(snapshot);
        window.componentRenderer.renderQuickWins(snapshot);
        window.componentRenderer.renderSidebar(snapshot);
        window.chartManager.updateData(snapshot);
        this.scheduleChartResize();
        this.updateFooterTime(snapshot.updatedAt);
    }

    /* ---------- 刷新入口与状态展示 ---------- */
    bindRefreshButton() {
        const btn = document.getElementById('refreshBtn');
        if (btn) {
            btn.addEventListener('click', () => this.refresh());
        }
    }

    // 刷新数据：委托给状态机，重复触发自动排队而非叠加
    refresh() {
        if (this.refreshController) {
            this.refreshController.request('manual');
        }
    }

    updateRefreshStatus(state, detail = {}) {
        const bar = document.getElementById('refreshStatus');
        const text = document.getElementById('refreshStatusText');
        const btn = document.getElementById('refreshBtn');
        if (!bar || !text || !btn) return;

        bar.dataset.state = state;
        btn.classList.toggle('is-refreshing', state === 'refreshing');

        if (state === 'refreshing') {
            text.textContent = '刷新中，正在同步数据…';
            btn.setAttribute('aria-busy', 'true');
        } else if (state === 'offline') {
            text.textContent = '连接已断开 · 展示上次完成的数据';
            btn.removeAttribute('aria-busy');
        } else {
            const updatedAt = detail.updatedAt || window.dataStore.getSnapshot().updatedAt;
            text.textContent = `已更新 · ${this.formatTime(updatedAt)}`;
            btn.removeAttribute('aria-busy');
        }
    }

    updateFooterTime(updatedAt) {
        const el = document.getElementById('footerUpdatedAt');
        if (el && updatedAt) {
            el.textContent = this.formatTime(updatedAt);
        }
    }

    formatTime(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    /* ---------- 窗口缩放：ResizeObserver + rAF 节流 ---------- */
    bindResize() {
        // 监听图表容器尺寸变化（窗口缩放、浏览器缩放、布局变化都会触发）
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => this.scheduleChartResize());
            document.querySelectorAll('.chart-container').forEach(el => {
                this.resizeObserver.observe(el);
            });
        }
        // 兜底：窗口尺寸变化
        window.addEventListener('resize', () => this.scheduleChartResize());
    }

    scheduleChartResize() {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            this.resizeRaf = null;
            window.chartManager.resize();
        });
    }

    /* ---------- 滚动：rAF 节流 ---------- */
    bindScroll() {
        window.addEventListener('scroll', () => {
            if (this.scrollTicking) return;
            this.scrollTicking = true;
            requestAnimationFrame(() => {
                this.handleScroll();
                this.scrollTicking = false;
            });
        }, { passive: true });
    }

    handleScroll() {
        const scrollY = window.scrollY;
        const header = document.querySelector('.header');

        if (header) {
            const opacity = Math.max(0.5, 1 - scrollY / 500);
            header.style.opacity = opacity;
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
