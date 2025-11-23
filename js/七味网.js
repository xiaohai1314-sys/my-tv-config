/**
 * 七味网(qwmkv.com) - 网盘+在线播放提取脚本 - v11.3 (前端分页优化版)
 *
 * 基于 v11.30 修改：
 * - 将搜索分页逻辑和缓存控制从后端迁移到前端，参考海绵小站插件设计。
 * - 新增前端 searchCache，减少对后端的重复请求，显著降低后端压力。
 * 
 * 【⭐ 新增功能】
 * - 统一 115 域名：将 115cdn.com 转换为 115.com。
 * - 清理尾部特殊符号：移除链接末尾所有非字母数字的特殊符号。
 * 
 * 【✅ 优化】
 * - 确保链接清理逻辑仅应用于包含 "115" 关键字的链接。
 * - 优化网盘命名逻辑为最简化模式：帖子名 + 规格关键词（如果有），否则仅帖子名。
 */

// ================== 配置区 ==================
const cheerio = createCheerio();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
// ★★★ 请务必将这里的IP地址修改为您后端服务器的实际IP地址 ★★★
const BACKEND_API_URL = 'http://192.168.1.3:3002/get-search-html'; // ★ 请修改为您的后端IP

const appConfig（{
    ver: 11.0,
    title: '七味网(纯盘   )',
    site: 'https://www.qnmp4.com',
    tabs: [
        { name: '电影', ext: { id: '/vt/1.html' } },
        { name: '剧集', ext: { id: '/vt/2.html' } },
        { name: '综艺', ext: { id: '/vt/3.html' } },
        { name: '动漫', ext: { id: '/vt/4.html' } },
    ],
});

// ================== 辅助函数 ==================
function log(msg) { try { $log(`[七味网 v11.0] ${msg}`); } catch (_) { console.log(`[七味网 v11.0] ${msg}`); } }
function argsify(ext) { if (typeof ext === 'string') { try { return JSON.parse(ext); } catch (e) { return {}; } } return ext || {}; }
function jsonify(data) { return JSON.stringify(data); }
async function fetchOriginalSite(url) {
    const headers = { 'User-Agent': UA };
    log(`直连请求URL: ${url}`);
    return $fetch.get(url, { headers });
}

// ================== 核心实现 ==================
async function init(ext) { return jsonify({}); }
async function getConfig() { return jsonify(appConfig); }

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    const pagePath = page === 1 ? ext.id : ext.id.replace('.html', `-${page}.html`);
    const url = `${appConfig.site}${pagePath}`;
    try {
        const fetchResult = await fetchOriginalSite(url);
        const html = fetchResult.data;
        const $ = cheerio.load(html);
        const cards = [];
        $('ul.content-list > li').each((_, element) => {
            const $li = $(element);
            const vod_id = $li.find('a').first().attr('href');
            const vod_name = $li.find('h3 > a').attr('title');
            const vod_pic = $li.find('div.li-img img').attr('src');
            const vod_remarks = $li.find('span.bottom2').text().trim();
            if (vod_id && vod_name) {
                cards.push({ vod_id, vod_name, vod_pic, vod_remarks, ext: { url: vod_id } });
            }
        });
        return jsonify({ list: cards, page: page, pagecount: page + (cards.length > 0 ? 1 : 0) });
    } catch (e) {
        log(`获取卡片列表异常: ${e.message}`);
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    const url = `${appConfig.site}${ext.url}`;
    try {
        const fetchResult = await fetchOriginalSite(url);
        const html = fetchResult.data;
        const $ = cheerio.load(html);
        const vod_name = $('div.main-ui-meta h1').text().replace(/\(\d+\)$/, '').trim();
        const tracks = [];

        // ========= ① 网盘下载逻辑（已修改，新增链接清理） =========
        const panDownloadArea = $('h2:contains("网盘下载")').parent();
        if (panDownloadArea.length > 0) {
            const panTypes = [];
            panDownloadArea.find('.nav-tabs .title').each((_, el) => panTypes.push($(el).text().trim()));
            panDownloadArea.find('.down-list.tab-content > ul.content').each((index, ul) => {
                const panType = panTypes[index] || '未知网盘';
                const groupTracks = [];
                $(ul).find('li.down-list2').each((_, li) => {
                    const $a = $(li).find('p.down-list3 a');
                    const originalLinkUrl = $a.attr('href');
                    const originalTitle = $a.attr('title') || $a.text();
                    
                    let linkUrl = originalLinkUrl;

                    // --- 【115网盘专属链接清理逻辑】 ---
                    if (linkUrl && linkUrl.includes('115')) {
                        linkUrl = linkUrl.replace('115cdn.com', '115.com');
                        linkUrl = linkUrl.replace(/[^a-zA-Z0-9]+$/, '');
                    }
                    // --- 【清理逻辑结束】 ---

                    // --- 【简化命名逻辑】 ---
                    let cleanedTitle = originalTitle;
                    cleanedTitle = cleanedTitle.replace(/\(《[^》]+》【[^】]+】提\.\.\.\)/, '').trim();
                    cleanedTitle = cleanedTitle.replace(/\[\w+\]$/, '').trim();
                    
                    let spec = '';
                    // ★★★★★★ 关键修复行：彻底杜绝 .g 1080p ★★★★★★
                    const specMatch = cleanedTitle.match(/(4K|2160p|1080p|720p|HDR10\+?|Dolby\s*Vision|DV|杜比视界|REMUX|原盘|高码率|高码|内封|简[繁英]?中|国粤双语|双语|合集|[\[\(【]([\d\.]+ ?[GM]B?)[\]\)】]|[\d\.]+ ?[GM]B?)/ig);
                    if (specMatch) {
                        spec = [...new Set(specMatch.map(s => s.toUpperCase().replace('GB', 'GB').replace('G', 'GB')))].join(' ').replace(/\s+/g, ' ');
                    }
                    
                    const trackName = spec 
                        ? `${vod_name} [${spec}]` 
                        : vod_name;
                    // --- 【命名逻辑结束】 ---
                    
                    let pwd = '';
                    const pwdMatch = linkUrl.match(/pwd=(\w+)/) || originalTitle.match(/(?:提取码|访问码)[：: ]\s*(\w+)/i);
                    if (pwdMatch) pwd = pwdMatch[1];
                    
                    groupTracks.push({ name: trackName, pan: linkUrl, ext: { pwd: pwd } });
                });
                if (groupTracks.length > 0) tracks.push({ title: panType, tracks: groupTracks });
            });
        }

        // ========= ② 修复后：在线播放分组 =========
        const onlineSection = $('#url .sBox');
        if (onlineSection.length > 0) {
            const tabNames = [];
            onlineSection.find('.py-tabs li').each((_, tab) => {
                const tabText = $(tab).text().trim().split('\n')[0];
                tabNames.push(tabText);
            });
            
            onlineSection.find('.bd ul.player').each((index, ul) => {
                const groupTracksOnline = [];
                $(ul).find('li a').each((_, a) => {
                    const $a = $(a);
                    const name = $a.text().trim();
                    const playUrl = $a.attr('href');
                    if (name && playUrl) {
                        groupTracksOnline.push({ name, pan: playUrl, ext: { play: true } });
                    }
                });
                
                if (groupTracksOnline.length > 0) {
                    const tabName = tabNames[index] || `播放源${index + 1}`;
                    tracks.push({ title: `在线播放-${tabName}`, tracks: groupTracksOnline });
                }
            });
        }

        return jsonify({ list: tracks });
    } catch (e) {
        log(`获取详情数据异常: ${e.message}`);
        return jsonify({ list: [] });
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);

    if (!ext.play) {
        const panLink = ext.pan;
        const password = ext.pwd;
        let finalUrl = panLink;
        if (password) finalUrl += `\n提取码: ${password}`;
        return jsonify({ urls: [finalUrl] });
    }

    const playPageUrl = `${appConfig.site}${ext.pan}`;
    try {
        const fetchResult = await fetchOriginalSite(playPageUrl);
        const html = fetchResult.data;
        const $ = cheerio.load(html);
        let playUrl = $('iframe').attr('src') || $('video source').attr('src') || $('video').attr('src');
        if (!playUrl) playUrl = playPageUrl;
        return jsonify({ urls: [playUrl] });
    } catch (e) {
        log(`解析在线播放失败: ${e.message}`);
        return jsonify({ urls: [] });
    }
}

// ================== 搜索逻辑 (★ MODIFIED ★ - 移植海绵小站模式) ==================
const searchCache = {};

async function search(ext) {
    ext = argsify(ext);
    const keyword = ext.text || '';
    const page = ext.page || 1;

    if (!keyword.trim()) {
        log("检测到无关键词的搜索调用，返回空列表。");
        return jsonify({ list: [], page: 1, pagecount: 1 });
    }

    if (searchCache.keyword !== keyword) {
        log(`新关键词 "${keyword}"，重置缓存。`);
        searchCache.keyword = keyword;
        searchCache.data = [];
        searchCache.pagecount = 0;
    }

    if (searchCache.data && searchCache.data[page - 1]) {
        log(`命中缓存: "${keyword}" 第 ${page} 页。`);
        return jsonify({
            list: searchCache.data[page - 1],
            page: page,
            pagecount: searchCache.pagecount
        });
    }

    if (searchCache.pagecount > 0 && page > searchCache.pagecount) {
        log(`请求页码 ${page} 超出总页数 ${searchCache.pagecount}，返回空列表。`);
        return jsonify({ list: [], page: page, pagecount: searchCache.pagecount });
    }

    log(`缓存未命中，开始请求后端: "${keyword}", 页码: ${page}`);
    const encodedKeyword = encodeURIComponent(keyword);
    const targetSearchUrl = `${appConfig.site}/vs/${encodedKeyword}----------${page}---.html`;

    try {
        const response = await $fetch.post(BACKEND_API_URL, 
            { search_url: targetSearchUrl, requested_page: page },
            { headers: { 'Content-Type': 'application/json' } }
        );

        let resultData;
        try { resultData = JSON.parse(response.data); }
        catch (parseError) {
            log(`JSON.parse 失败，直接使用 response.data: ${parseError.message}`);
            resultData = response.data;
        }

        if (!resultData || typeof resultData !== 'object' || !resultData.html || !resultData.paginationInfo) {
            if (resultData && resultData.error) throw new Error(`后端返回错误: ${resultData.error}`);
            throw new Error("前端收到的数据格式不正确或缺少关键字段。");
        }

        const html = resultData.html;
        const paginationInfo = resultData.paginationInfo;

        const $ = cheerio.load(html);
        const cards = [];
        $('div.sr_lists dl').each((_, element) => {
            const $dl = $(element);
            const vod_id = $dl.find('dt a').attr('href');
            const vod_name = $dl.find('dd p strong a').text();
            const vod_pic = $dl.find('dt a img').attr('src');
            const vod_remarks = $dl.find('dd p span.ss1').text().trim();
            if (vod_id && vod_name) {
                cards.push({ vod_id, vod_name, vod_pic, vod_remarks, ext: { url: vod_id } });
            }
        });
        
        log(`成功从后端获取并解析到 ${cards.length} 条数据。`);

        if (!searchCache.data) searchCache.data = [];
        searchCache.data[page - 1] = cards;
        if (paginationInfo.totalPages > 0) {
            searchCache.pagecount = paginationInfo.totalPages;
        }
        
        log(`缓存更新: "${keyword}" 第 ${page} 页数据已存入。当前已知总页数: ${searchCache.pagecount}`);

        return jsonify({
            list: cards,
            page: page,
            pagecount: searchCache.pagecount
        });

    } catch (e) {
        log(`搜索异常: ${e.message}`);
        $toast(`搜索失败: ${e.message}`);
        return jsonify({ list: [], page: page, pagecount: searchCache.pagecount || page });
    }
}
