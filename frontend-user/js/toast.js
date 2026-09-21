/* ========================================
   Toast 提示组件
   ======================================== */

class Toast {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.init();
    }

    init() {
        // 创建 toast 容器
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * 显示 toast 提示
     * @param {Object} options - 配置选项
     * @param {string} options.type - 类型: success, error, warning, info
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息内容
     * @param {number} options.duration - 显示时长(ms)，默认 4000
     * @param {boolean} options.closable - 是否可关闭，默认 true
     */
    show(options) {
        const {
            type = 'info',
            title = '',
            message = '',
            duration = 4000,
            closable = true
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type]}</div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            ${closable ? '<button class="toast-close">✕</button>' : ''}
            <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
        `;

        // 添加关闭事件
        if (closable) {
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => this.close(toast));
        }

        // 添加到容器
        this.container.appendChild(toast);
        this.toasts.push(toast);

        // 自动关闭
        if (duration > 0) {
            setTimeout(() => this.close(toast), duration);
        }

        return toast;
    }

    close(toast) {
        if (!toast || toast.classList.contains('toast-exit')) return;
        
        toast.classList.add('toast-exit');
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 300);
    }

    // 快捷方法
    success(title, message, duration) {
        return this.show({ type: 'success', title, message, duration });
    }

    error(title, message, duration) {
        return this.show({ type: 'error', title, message, duration });
    }

    warning(title, message, duration) {
        return this.show({ type: 'warning', title, message, duration });
    }

    info(title, message, duration) {
        return this.show({ type: 'info', title, message, duration });
    }

    /**
     * 复用同一条常驻提示（不自动消失），用于刷新状态流转
     * 刷新中 -> 刷新完成 / 刷新失败 时只更新内容与样式，不堆叠新 toast
     */
    sticky(key, type, title, message) {
        if (!this._stickyToasts) this._stickyToasts = {};

        const toast = this._stickyToasts[key];
        if (toast && !toast.dataset.dismissed && document.body.contains(toast)) {
            toast.className = `toast toast-${type} toast-sticky`;
            const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
            toast.querySelector('.toast-icon').textContent = icons[type] || 'ℹ';
            toast.querySelector('.toast-title').textContent = title;
            const msgEl = toast.querySelector('.toast-message');
            if (msgEl) msgEl.textContent = message;
            // 刷新中的转圈动画（spinner 模式）
            const iconEl = toast.querySelector('.toast-icon');
            iconEl.classList.toggle('is-spinning', type === 'info' && /刷新中|重新加载/.test(title));
            return toast;
        }

        const created = this.show({ type, title, message, duration: 0, closable: false });
        created.classList.add('toast-sticky');
        this._stickyToasts[key] = created;
        const iconEl = created.querySelector('.toast-icon');
        iconEl.classList.add('is-spinning');
        return created;
    }

    // 关闭并移除常驻提示
    dismissSticky(key, delay = 0) {
        if (!this._stickyToasts || !this._stickyToasts[key]) return;
        const toast = this._stickyToasts[key];
        // 关闭动画期间标记为已关闭，防止状态流中被重新复用
        toast.dataset.dismissed = '1';
        setTimeout(() => this.close(toast), delay);
        delete this._stickyToasts[key];
    }

    // 清除所有 toast
    clearAll() {
        this.toasts.forEach(toast => this.close(toast));
    }
}

// 创建全局实例
window.toast = new Toast();
