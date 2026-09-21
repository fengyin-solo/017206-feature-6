/* ========================================
   刷新流程状态机
   状态流转: idle(完成) → refreshing(进行中) → offline(断开)
   - 同一时间只跑一个刷新流程
   - 进行中再次触发 → 排队一次，不叠加
   - 断开/超时 → 回滚到上一次完成的快照
   ======================================== */

class RefreshController {
    constructor({ store, timeout = 6000, onRender, onStateChange } = {}) {
        this.store = store;
        this.timeout = timeout;
        this.onRender = onRender || (() => {});
        this.onStateChange = onStateChange || (() => {});

        this.state = 'idle';
        this.queued = false;          // 排队标记：进行中再次触发只排一次
        this.abortController = null;  // 进行中请求的中断句柄

        window.addEventListener('offline', () => this.handleOffline());
        window.addEventListener('online', () => this.handleOnline());
    }

    setState(state, detail = {}) {
        this.state = state;
        this.onStateChange(state, detail);
    }

    // 外部触发入口：进行中则排队，不叠加
    request(source = 'manual') {
        if (this.state === 'refreshing') {
            if (!this.queued) {
                this.queued = true;
                window.toast.info('已加入队列', '当前刷新进行中，完成后将自动再执行一次');
            }
            return;
        }
        this.run(source);
    }

    async run(source) {
        this.setState('refreshing', { source });
        this.abortController = new AbortController();

        try {
            const snapshot = await this.store.fetchSnapshot({
                timeout: this.timeout,
                signal: this.abortController.signal
            });

            // 提交快照并整体渲染，保证各模块与数据源一致
            this.store.commit(snapshot);
            this.onRender(snapshot);
            this.setState('idle', { updatedAt: snapshot.updatedAt });
            window.toast.success('刷新完成', '数据已更新至最新状态');
        } catch (err) {
            // 断开 / 超时 / 中断：恢复到上一次完成的状态
            const lastSnapshot = this.store.getSnapshot();
            this.onRender(lastSnapshot);
            this.setState('offline', { reason: err.message });

            const reasonText = err.message === 'timeout' ? '请求超时' : '网络连接断开';
            window.toast.error('刷新中断', `${reasonText}，已恢复到上一次完成的状态`);
        } finally {
            this.abortController = null;

            // 有排队的请求：紧接着执行一次
            if (this.queued) {
                this.queued = false;
                this.run('queued');
            }
        }
    }

    // 网络断开：中断进行中的刷新（由 catch 分支回滚），否则直接标记断开
    handleOffline() {
        if (this.abortController) {
            this.abortController.abort();
            return;
        }
        if (this.state !== 'offline') {
            this.setState('offline', { reason: 'offline' });
            window.toast.warning('网络已断开', '当前展示为最近一次完成的数据');
        }
    }

    // 网络恢复：自动触发一次刷新
    handleOnline() {
        window.toast.info('网络已恢复', '正在重新同步数据…');
        this.request('online');
    }
}

window.RefreshController = RefreshController;
