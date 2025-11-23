// ==UserScript==
// @name         七味网(qwmkv.com) - 网盘+在线播放提取脚本
// @version      11.4
// @description  纯盘+在线播放，已根治 .g 问题，分类正常
// @author       匿名大佬 + 终极修复
// @match        *://*/*
// ==/UserScript==

const cheerio = createCheerio();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

// ★★★ 请务必改成你自己的后端IP ★★★
const BACKEND_API_URL = 'http://192.168.1.3:3002/get-search-html';

const appConfig = {
    ver: 11.4,
    title: '七味网(纯盘)',
    site: 'https://www.qnmp4.com',
    tabs: [
        { name: '电影', ext: { id: '/vt/1.html' } },
        { name: '剧集', ext: { id: '/vt/2.html' } },
        { name: '综艺', ext: { id: '/vt/3.html' } },
        { name: '动漫', ext: { id: '/vt/4.html' } },
    ],
};

function log(msg) { try { $log(`[七味网 v11.4] ${msg}`); } catch (_) { console.log(`[七味网 v11.4] ${msg}`); } }
function argsify(ext) { if (typeof ext === 'string') { try { return JSON.parse(ext); } catch (_) { return {}; } } return ext || {}; }
function jsonify(data) { return JSON.stringify(data); }

async function fetchOriginalSite(url) {
    const headers = { 'User-Agent': UA };
    log(`直连请求: ${url}`);
    return $fetch.get(url, { headers });
}

async function init(ext) { return jsonify({}); }
async function getConfig() { return jsonify(appConfig); }

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    const pagePath = page === 1 ? ext.id : ext.id.replace('.html', `-${page}.html`);
    const url = `${appConfig.site}${pagePath}`;
    try {
        const { data: html } = await fetchOriginalSite(url);
        const $ = cheerio.load(html);
        const cards = [];
        $('ul.content-list > li').each((_, el) => {
            const $li = $(el);
            const vod_id = $li.find('a').first().attr('href');
            const vod_name = $li.find('h3 > a').attr('title') || $li.find('h3 > a').text();
            const vod_pic = $li.find('div.li-img img').attr('src');
            const vod_remarks = $li.find('span.bottom2').text().trim();
            if (vod_id && vod_name) cards.push({ vod_id, vod_name, vod_pic, vod_remarks, ext: { url: vod_id } });
        });
        return jsonify({ list: cards, page, pagecount: page + (cards.length >= 20 ? 1 : 0) });
    } catch (e) {
        log(`分类获取失败: ${e.message}`);
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    const url = `${appConfig.site}${ext.url}`;
    try {
        const { data: html } = await fetchOriginalSite(url);
        const $ = cheerio.load(html);
        const vod_name = $('div.main-ui-meta h1').text().replace(/\(\d+\)$/, '').trim();
        const tracks = [];

        // 网盘部分
        const panArea = $('h2:contains("网盘下载")').parent();
        if (panArea.length) {
            const types = [];
            panArea.find('.nav-tabs .title').each((_, el) => types.push($(el).text().trim()));
            panArea.find('.down-list.tab-content > ul.content').each((i, ul) => {
                const panType = types[i] || '其他网盘';
                const list = [];
                $(ul).find('li.down-list2').each((_, li) => {
                    const $a = $(li).find('p.down-list3 a');
                    let link = $a.attr('href') || '';
                    let title = ($a.attr('title') || $a.text() || '').trim();

                    // 115 清理
                    if (link.includes('115')) {
                        link = link.replace('115cdn.com', '115.com').replace(/[^a-zA-Z0-9]+$/, '');
                    }

                    // 标题清理
                    title = title.replace(/\(《[^》]+》【[^】]+】提\.\.\.\)/g, '')
                                 .replace(/\[\w+\]$/g, '')
                                 .trim();

                    // 终极防 .g 正则（已实测完美）
                    const specs = title.match(/(4K|2160p|1080p|720p|HDR10\+?|Dolby\s*Vision|DV|杜比视界|REMUX|原盘|高码率|高码|内封|简[繁英]?中|国粤双语|双语|合集|[\[\(【] ?([\d\.]+ ?[GM]B?) ?[\]\)】]|[\d\.]+ ?[GM]B?)/ig) || [];
                    let specStr = '';
                    if (specs.length) {
                        specStr = [...new Set(specs.map(s => s.toUpperCase().replace(/G$/, 'GB').replace(/G B/, 'GB')))]
                                  .join(' ').replace(/\s+/g, ' ');
                    }

                    const name = specStr ? `${vod_name} [${specStr}]` : vod_name;

                    let pwd = '';
                    const pwdMatch = link.match(/pwd=(\w+)/) || title.match(/(?:提取码|访问码)[：: ]\s*(\w+)/i);
                    if (pwdMatch) pwd = pwdMatch[1];

                    list.push({ name, pan: link, ext: { pwd } });
                });
                if (list.length) tracks.push({ title: panType, tracks: list });
            });
        }

        // 在线播放部分
        const online = $('#url .sBox');
        if (online.length) {
            const tabs = [];
            online.find('.py-tabs li').each((_, el) => tabs.push($(el).text().trim().split('\n')[0]));
            online.find('.bd ul.player').each((i, ul) => {
                const list = [];
                $(ul).find('li a').each((_, a) => {
                    const $a = $(a);
                    const name = $a.text().trim();
                    const href = $a.attr('href');
                    if (name && href) list.push({ name, pan: href, ext: { play: true } });
                });
                if (list.length) tracks.push({ title: `在线播放-${tabs[i] || i+1}`, tracks: list });
            });
        }

        return jsonify({ list: tracks });
    } catch (e) {
        log(`详情页异常: ${e.message}`);
        return jsonify({ list: [] });
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    if (!ext.play) {
        let url = ext.pan || '';
        if (ext.pwd) url += `\n提取码: ${ext.pwd}`;
        return jsonify({ urls: [url] });
    }
    const playUrl = `${appConfig.site}${ext.pan}`;
    try {
        const { data: html } = await fetchOriginalSite(playUrl);
        const $ = cheerio.load(html);
        const src = $('iframe').attr('src') || $('video source').attr('src') || $('video').attr('src') || playUrl;
        return jsonify({ urls: [src] });
    } catch (e) {
        log(`播放地址解析失败: ${e.message}`);
        return jsonify({ urls: [] });
    }
}

// 搜索（前端缓存版）
const searchCache = {};

async function search(ext) {
    ext = argsify(ext);
    const keyword = (ext.text || '').trim();
    const page = ext.page || 1;

    if (!keyword) return jsonify({ list: [], page: 1, pagecount: 1 });

    if (searchCache.keyword !== keyword) {
        searchCache.keyword = keyword;
        searchCache.data = [];
        searchCache.pagecount = 0;
    }

    if (searchCache.data && searchCache.data[page - 1]) {
        return jsonify({ list: searchCache.data[page - 1], page, pagecount: searchCache.pagecount });
    }

    if (searchCache.pagecount && page > searchCache.pagecount) {
        return jsonify({ list: [], page, pagecount: searchCache.pagecount });
    }

    const searchUrl = `${appConfig.site}/vs/${encodeURIComponent(keyword)}----------${page}---.html`;

    try {
        const resp = await $fetch.post(BACKEND_API_URL, 
            { search_url: searchUrl, requested_page: page },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
        if (!data?.html) throw new Error('后端返回数据异常');

        const $ = cheerio.load(data.html);
        const cards = [];
        $('div.sr_lists dl').each((_, el) => {
            const $dl = $(el);
            const vod_id = $dl.find('dt a').attr('href');
            const vod_name = $dl.find('dd p strong a').text();
            const vod_pic = $dl.find('dt a img').attr('src');
            const vod_remarks = $dl.find('dd p span.ss1').text().trim();
            if (vod_id && vod_name) cards.push({ vod_id, vod_name, vod_pic, vod_remarks, ext: { url: vod_id } });
        });

        if (!searchCache.data) searchCache.data = [];
        searchCache.data[page - 1] = cards;
        if (data.paginationInfo?.totalPages) searchCache.pagecount = data.paginationInfo.totalPages;

        return jsonify({ list: cards, page, pagecount: searchCache.pagecount });

    } catch (e) {
        log(`搜索失败: ${e.message}`);
        $toast(`搜索失败: ${e.message}`);
        return jsonify({ list: [], page, pagecount: searchCache.pagecount || page });
    }
}
