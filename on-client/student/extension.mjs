// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView({ api } = {}) {
  // 학생 기록 재조회는 한 번에 하나만 실행합니다. 제공 화면의 새 입력은 이전 결과보다 우선합니다.
  let eventQueryPending = false;
  let eventMount = null;
  // 꾸밈은 이 학생 함수가 새로 만든 요소에만 적용합니다. 제공 DOM·전역 CSS는 변경하지 않습니다.
  const polish = (node, tag) => {
    const styles = {
      p: { margin: '0.45rem 0', overflowWrap: 'anywhere' },
      h3: { margin: '0 0 0.8rem', fontSize: '1.2rem', letterSpacing: '-0.025em' },
      h4: { margin: '0 0 0.6rem', fontSize: '1.05rem' },
      section: { minWidth: '0', marginBlock: '0.9rem' },
      details: { marginBlock: '1rem', padding: '0.9rem', border: '1px solid #dce2ef', borderRadius: '12px', background: 'var(--surface, #ffffff)' },
      summary: { cursor: 'pointer', fontWeight: '700', padding: '0.25rem', minHeight: '2rem' },
      button: { minHeight: '44px', padding: '0.6rem 1rem', border: '1px solid #c6cee0', borderRadius: '10px', background: 'var(--surface, #ffffff)', color: 'inherit', font: 'inherit', fontWeight: '600', cursor: 'pointer' },
      select: { minHeight: '44px', maxWidth: '100%', border: '1px solid #c6cee0', borderRadius: '8px', padding: '0.4rem 0.6rem', background: 'var(--surface, #ffffff)', color: 'inherit' },
      table: { width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' },
      caption: { textAlign: 'left', fontWeight: '600', padding: '0.6rem 0' },
      th: { padding: '0.7rem 0.65rem', textAlign: 'left', borderBottom: '1px solid #dce2ef', background: '#f1f4fa' },
      td: { padding: '0.7rem 0.65rem', borderBottom: '1px solid #e4e8f1' },
      meter: { width: '5rem', maxWidth: '100%', height: '0.85rem', verticalAlign: 'middle' },
    };
    Object.assign(node.style, styles[tag] || {});
    return node;
  };
  const panelStyle = { padding: '1rem', margin: '0', border: '1px solid #dce2ef', borderRadius: '12px', background: 'var(--surface, #ffffff)', boxShadow: '0 3px 12px rgba(28, 36, 48, 0.035)', minWidth: '0' };
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      // 호출마다 새 요소를 반환합니다. 이전 입력이나 DOM을 보관하지 않습니다.
      const root = document.createElement('div');
      root.style.fontSize = '1rem';
      root.style.lineHeight = '1.65';
      const text = (parent, tag, value) => {
        const element = polish(document.createElement(tag), tag);
        element.textContent = value;
        if (tag === 'h3') element.style.fontSize = '1.2rem';
        if (tag === 'h4') element.style.fontSize = '1.1rem';
        parent.appendChild(element);
        return element;
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      const deviceState = status => {
        switch (status) {
          case 'compliant': return '보안 기준 충족 (compliant)';
          case 'noncompliant': return '보안 기준 미충족 (noncompliant)';
          default: return '확인 불가 (unknown)';
        }
      };
      const sessionState = status => {
        switch (status) {
          case 'active': return '활성 (active)';
          case 'expired': return '만료 (expired)';
          case 'revoked': return '철회됨 (revoked)';
          default: return '확인 불가 (unknown)';
        }
      };
      const deviceLine = device =>
        `기기 이름: ${value(device?.label)} · 기기 ID: ${value(device?.id)} · 상태: ${deviceState(device?.status)}`;
      const sessionLine = session =>
        `세션 ID: ${value(session?.id)} · 상태: ${sessionState(session?.status)}`;
      const section = (title, input, renderData) => {
        const container = text(identityDetails, 'section', '');
        text(container, 'h3', title);
        switch (input?.mode) {
          case 'connected': break;
          case 'demo': text(container, 'p', '예제 자료 (demo)'); break;
          case 'disconnected': text(container, 'p', '연결 없음 (disconnected)'); break;
          default: text(container, 'p', '확인 불가 (unknown)'); break;
        }
        if (input?.status === 'loading') {
          text(container, 'p', '불러오는 중');
        } else if (input?.status === 'error') {
          text(container, 'p', `연결 실패 또는 확인 불가: ${value(input.error?.message)}`);
        } else if (input?.status === 'ok') {
          renderData(container, input.data);
        } else {
          text(container, 'p', '확인 불가');
        }
      };
      const overview = text(root, 'section', '');
      overview.setAttribute('aria-label', 'nævis 상태 요약');
      text(overview, 'h3', 'nævis 상태 요약');
      text(overview, 'p', '전달받은 계정·기기·세션 조회 결과입니다. PC 악성코드 검사 결과가 아니며 AI 연결 점검과는 별개입니다.');
      const cards = text(overview, 'div', '');
      cards.classList.add('grid-2');
      Object.assign(cards.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))', gap: '0.8rem', alignItems: 'stretch' });
      const provenance = input => input?.mode === 'demo'
        ? '예시 자료 · 실제 조회 결과 아님 (demo)'
        : input?.mode === 'connected' ? '연동 자료 (connected)'
        : input?.mode === 'disconnected' ? '연결 없음 (disconnected)' : '자료 출처 확인 불가 (unknown)';
      const card = (title, input, render) => {
        const panel = text(cards, 'section', '');
        panel.classList.add('card');
        Object.assign(panel.style, panelStyle);
        text(panel, 'h4', title);
        const source = text(panel, 'p', provenance(input));
        Object.assign(source.style, { padding: '0.4rem 0.55rem', border: '1px solid #dce2ef', borderRadius: '7px', background: '#f1f4fa', fontSize: '0.875rem' });
        if (input?.status === 'loading') text(panel, 'p', '불러오는 중');
        else if (input?.status === 'error') text(panel, 'p', `조회 실패 · 확인 불가: ${value(input.error?.message)}`);
        else if (input?.status === 'ok') render(panel, input.data);
        else text(panel, 'p', '확인 불가 · 현재 조회 결과 없음');
      };
      card('사용자', me, (panel, data) => {
        text(panel, 'p', value(data?.user?.label));
        text(panel, 'p', `사용자 ID: ${value(data?.user?.id)}`);
      });
      card('현재 기기', me, (panel, data) => {
        text(panel, 'p', deviceLine(data?.device));
      });
      card('현재 세션', me, (panel, data) => {
        text(panel, 'p', sessionLine(data?.session));
      });
      // 자료 연결은 세 요약 카드 아래 전체 너비를 사용합니다.
      const connectionCard = text(overview, 'section', '');
      connectionCard.classList.add('card');
      Object.assign(connectionCard.style, { ...panelStyle, marginBlockStart: '0.8rem' });
      text(connectionCard, 'h4', '계정·기기·세션 자료 연결');
      const connectionRows = text(connectionCard, 'div', '');
      Object.assign(connectionRows.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))', gap: '0.8rem' });
      for (const [name, input] of [['계정', me], ['기기 목록', devices], ['현재 세션 목록', sessions]]) {
        const state = input?.status === 'loading' ? '불러오는 중'
          : input?.status === 'error' ? '조회 실패'
          : input?.status === 'ok' ? '응답 수신' : '확인 불가';
        const row = text(connectionRows, 'p', `${name}: ${state} · ${provenance(input)}`);
        Object.assign(row.style, { margin: '0', padding: '0.7rem', border: '1px solid #dce2ef', borderRadius: '8px', background: '#f1f4fa' });
      }
      text(connectionCard, 'p', '연결 실패 시 위쪽 「다시 불러오기」 버튼으로 직접 재시도하세요. AI 연결 여부는 AI 연결 점검 영역에서 확인하세요.');
      const priorities = text(root, 'section', '');
      Object.assign(priorities.style, { ...panelStyle, marginBlock: '1rem', background: '#f1f4fa' });
      text(priorities, 'h3', '핵심 기능 안내');
      text(priorities, 'p', '① 내 PC 상태: 제공 「내 PC 확인」에서 실측값·단위·시각 확인');
      text(priorities, 'p', '② 보안 기록: 보안 기록 메뉴에서 학생 날짜별 추이·목록·기록 다시 조회');
      text(priorities, 'p', '③ 자료 연결 확인: 학생 상태·알림 영역에서 SDP 진단·실패 항목·다음 행동 확인');
      const identityDetails = text(root, 'details', '');
      text(identityDetails, 'summary', '계정·기기·세션 상세 펼치기');
      section('현재 계정·기기·세션', me, (container, data) => {
        text(container, 'p', `사용자 이름: ${value(data?.user?.label)}`);
        text(container, 'p', `사용자 ID: ${value(data?.user?.id)}`);
        text(container, 'p', deviceLine(data?.device));
        text(container, 'p', sessionLine(data?.session));
      });
      section('기기 목록', devices, (container, data) => {
        if (!Array.isArray(data)) {
          text(container, 'p', '확인 불가: 기기 목록 형식을 확인할 수 없습니다.');
        } else if (data.length === 0) {
          text(container, 'p', '표시할 기기가 없습니다.');
        } else {
          const list = text(container, 'ul', '');
          for (const device of data) text(list, 'li', deviceLine(device));
        }
      });
      section('세션 목록', sessions, (container, data) => {
        if (!Array.isArray(data)) {
          text(container, 'p', '확인 불가: 세션 목록 형식을 확인할 수 없습니다.');
        } else if (data.length === 0) {
          text(container, 'p', '표시할 세션이 없습니다.');
        } else {
          const list = text(container, 'ul', '');
          for (const session of data) text(list, 'li', sessionLine(session));
        }
      });
      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('div');
      const line = value => {
        const element = document.createElement('p');
        element.textContent = value;
        root.appendChild(element);
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      switch (mode) {
        case 'connected': break;
        case 'demo': line('예제 자료 (demo)'); break;
        case 'disconnected': line('연결 없음 (disconnected)'); break;
        default: line('연결 상태 확인 불가 (unknown)'); break;
      }
      // 요청 실패·대기 중에는 이전 data의 판정·이유·시각을 표시하지 않습니다.
      line(`업무 앱 ID: ${value(status === 'ok' ? data?.appId : appId)}`);
      if (status === 'idle') {
        line('업무 앱을 선택하고 접근을 요청하세요.');
      } else if (status === 'loading') {
        line('접근 판정 확인 중');
      } else if (status === 'error') {
        line(`접근 요청 실패: ${value(error?.message)}`);
        line('요청 실패는 접근 거부 판정이 아닙니다. 접근 허용 여부는 확인할 수 없습니다.');
      } else if (status === 'ok') {
        switch (data?.decision) {
          case 'allow':
            line('접근 허용 (allow)');
            line('정책상 접근 허용이며 실제 업무 앱 접속 성공을 보장하지 않습니다.');
            break;
          case 'deny': line('접근 거부 (deny)'); break;
          case 'challenge':
            line('추가 인증 또는 확인 필요 (challenge)');
            line('이 앱은 추가 인증이나 확인 절차를 대신 수행하지 않습니다.');
            break;
          default: line('판정 확인 불가 (unknown)'); break;
        }
        line(`판정 이유: ${value(data?.reason)}`);
        line(`판정 시각: ${value(data?.checkedAt)}`);
      } else {
        line('판정 확인 불가 (unknown)');
      }
      return root;
    },
    renderEvents(input = {}) {
      const renderRecords = ({ status, mode, data, error } = {}) => {
      // 입력마다 새 DOM과 선택 상태를 만듭니다. 원본 목록은 변경하지 않습니다.
      const root = document.createElement('div');
      root.style.lineHeight = '1.65';
      const text = (parent, tag, content) => {
        const node = polish(document.createElement(tag), tag);
        node.textContent = content;
        parent.appendChild(node);
        return node;
      };
      const value = input => typeof input === 'string' && input.length > 0
        ? input : '확인 불가';
      const appLabel = appId => typeof appId === 'string' && appId.length > 0
        ? appId : '업무 앱 확인 불가';
      const kindLabel = kind => kind === 'access' ? '접속 기록 (access)'
        : kind === 'xdr' ? 'XDR 경보 (xdr)' : '확인 불가 (unknown)';
      switch (mode) {
        case 'connected': break;
        case 'demo': text(root, 'p', '예시 자료 · 실제 조회 결과 아님 (demo)'); break;
        case 'disconnected': text(root, 'p', '연결 없음 (disconnected)'); break;
        default: text(root, 'p', '연결 상태 확인 불가 (unknown)'); break;
      }
      if (status === 'loading') {
        text(root, 'p', '기록을 불러오는 중 · 추이 집계 대기');
        return root;
      }
      if (status === 'error') {
        root.setAttribute('role', 'alert');
        Object.assign(root.style, { ...panelStyle, borderInlineStart: '4px solid #b42318' });
        text(root, 'h3', '보안 기록 조회 실패');
        text(root, 'p', `실패한 항목: 보안 기록 · 코드: ${value(error?.code)}`);
        text(root, 'p', `이유: ${value(error?.message)}`);
        text(root, 'p', '기록 추이: 조회 불가. 조회 실패는 기록 0건을 뜻하지 않습니다. 로컬 서버 실행 상태를 확인한 뒤 「기록 다시 조회」를 누르세요. 제공 화면 전체는 위쪽 「다시 불러오기」로 갱신합니다.');
        if (error?.code === 'CONTRACT_MISMATCH') {
          text(root, 'p', '확인 불가: 기록 응답 형식이 입력 계약과 일치하지 않습니다.');
        }
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        text(root, 'p', '확인 불가: 기록 응답을 확인할 수 없습니다.');
        return root;
      }
      if (data.length === 0) {
        text(root, 'p', '표시할 기록이 없습니다');
        text(root, 'p', '받은 기록 0건 · 추이를 계산할 자료가 없습니다. 전체 이력이 없다는 뜻은 아닙니다.');
        return root;
      }
      const records = [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      text(root, 'p', '현재 조회 범위는 본인의 최근 기록 최대 40건입니다. XDR 경보는 저장된 경보이며 새로 탐지한 결과가 아닙니다.');
      const accessLabel = state => state === 'allowed' ? '접근 허용 (allowed)'
        : state === 'denied' ? '접근 거부 (denied)' : '확인 불가(unknown)';
      const sessionLabel = state => {
        switch (state) {
          case 'active': return '활성 (active)';
          case 'expired': return '만료 (expired)';
          case 'revoked': return '철회됨 (revoked)';
          default: return '확인 불가(unknown)';
        }
      };
      const deviceLabel = state => state === 'compliant' ? '보안 기준 충족 (compliant)'
        : state === 'noncompliant' ? '보안 기준 미충족 (noncompliant)' : '확인 불가(unknown)';
      const filters = text(root, 'div', '');
      filters.style.display = 'flex';
      filters.style.flexWrap = 'wrap';
      filters.style.gap = '0.75rem';
      filters.style.marginBlock = '1rem';
      Object.assign(filters.style, { padding: '0.85rem', borderRadius: '12px', background: '#f1f4fa', alignItems: 'end' });
      const makeFilter = (name, values, labelFor) => {
        const label = text(filters, 'label', name);
        const select = polish(document.createElement('select'), 'select');
        Object.assign(label.style, { display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '0', flex: '1 1 9rem', fontWeight: '600' });
        select.setAttribute('aria-label', name);
        select.style.fontSize = '1rem';
        select.style.marginInlineStart = '0';
        // label로 감싼 네이티브 선택 상자는 키보드로 조작할 수 있습니다.
        label.appendChild(select);
        const add = (raw, caption) => {
          const option = text(select, 'option', caption);
          option.value = raw;
        };
        add('all', '전체');
        for (const raw of new Set(values.filter(item => typeof item === 'string' && item.length > 0))) {
          add(raw, labelFor(raw));
        }
        select.value = 'all';
        return select;
      };
      const kindFilter = makeFilter('기록 종류', records.map(event => event.kind), kindLabel);
      const appFilter = makeFilter('업무 앱', records.map(event => event.appId), appLabel);
      const accessFilter = makeFilter('접속 상태', records.map(event => event.state?.access), accessLabel);
      const trend = text(root, 'section', '');
      trend.setAttribute('aria-label', '받은 기록의 날짜별 추이');
      text(trend, 'h3', '받은 기록의 날짜별 추이');
      text(trend, 'p', '현재 필터에 해당하는 받은 기록만 한국 시각(Asia/Seoul) 날짜로 집계합니다. 최근 최대 40건의 일부 이력이며, 기록이 없는 날짜를 0건으로 채우지 않습니다.');
      const trendBody = text(trend, 'div', '');
      trendBody.style.overflowX = 'auto';
      const dateKey = at => {
        if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date(at));
        const get = type => parts.find(part => part.type === type)?.value;
        return `${get('year')}-${get('month')}-${get('day')}`;
      };
      const drawTrend = shown => {
        trendBody.replaceChildren();
        const days = new Map();
        let missing = 0;
        for (const event of shown) {
          const day = dateKey(event.at);
          if (!day) { missing++; continue; }
          const counts = days.get(day) || { access: 0, xdr: 0, other: 0, total: 0 };
          counts.total++;
          if (event.kind === 'access') counts.access++;
          else if (event.kind === 'xdr') counts.xdr++;
          else counts.other++;
          days.set(day, counts);
        }
        if (missing) text(trendBody, 'p', `시각 확인 불가 ${missing}건은 날짜별 집계에서 제외했습니다. 목록에는 유지합니다.`);
        if (days.size === 0) {
          text(trendBody, 'p', '현재 필터에서 날짜별 추이를 계산할 기록이 없습니다.');
          return;
        }
        const maximum = Math.max(...Array.from(days.values(), day => day.total));
        const table = text(trendBody, 'table', '');
        text(table, 'caption', '날짜별 받은 기록 건수 · 필터 적용 결과');
        const head = text(text(table, 'thead', ''), 'tr', '');
        for (const label of ['한국 시각 날짜', '접속 기록', 'XDR 경보', '기타·확인 불가', '합계·상대 크기']) {
          text(head, 'th', label).setAttribute('scope', 'col');
        }
        const body = text(table, 'tbody', '');
        for (const [day, counts] of [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          const row = text(body, 'tr', '');
          text(row, 'th', day).setAttribute('scope', 'row');
          for (const number of [counts.access, counts.xdr, counts.other]) text(row, 'td', `${number}건`);
          const total = text(row, 'td', `${counts.total}건 `);
          const meter = text(total, 'meter', `${counts.total}건 / 표시 날짜 중 최대 ${maximum}건`);
          meter.setAttribute('min', '0');
          meter.setAttribute('max', String(maximum));
          meter.setAttribute('value', String(counts.total));
          meter.setAttribute('aria-label', `${day} 받은 기록 ${counts.total}건, 표시 날짜 중 최대 ${maximum}건`);
        }
      };
      const count = text(root, 'p', '');
      const list = text(root, 'ul', '');
      Object.assign(list.style, { listStyle: 'none', padding: '0', display: 'grid', gap: '0.8rem' });
      const detail = text(root, 'div', '');
      const showDetail = event => {
        detail.replaceChildren();
        const panel = text(detail, 'section', '');
        panel.setAttribute('data-student-event-detail', event.id);
        Object.assign(panel.style, { ...panelStyle, marginBlock: '1rem' });
        text(panel, 'h3', `${value(event.id)} 상세`);
        text(panel, 'p', `사건 ID: ${value(event.id)} · 업무 앱: ${appLabel(event.appId)}`);
        const entries = (heading, rows) => {
          text(panel, 'h4', heading);
          if (!Array.isArray(rows)) {
            text(panel, 'p', '확인 불가');
          } else if (rows.length === 0) {
            text(panel, 'p', '표시할 항목이 없습니다.');
          } else {
            const items = text(panel, 'ul', '');
            for (const row of rows) text(items, 'li', `ID: ${value(row.id)} · ${value(row.text)}`);
          }
        };
        entries('근거', event.evidence);
        entries('규칙', event.rules);
        text(panel, 'h4', '기록의 상태');
        text(panel, 'p', `접속 상태: ${accessLabel(event.state?.access)}`);
        text(panel, 'p', `세션 상태: ${sessionLabel(event.state?.session)}`);
        text(panel, 'p', `기기 상태: ${deviceLabel(event.state?.device)}`);
        if (Array.isArray(event.supportedActions) && event.supportedActions.length > 0) {
          text(panel, 'p', '조치 실행 연결은 준비 중입니다. 아직 지원하지 않는 조치이며 요청을 보내지 않습니다.');
          for (const action of event.supportedActions) {
            if (typeof action !== 'string' || action.length === 0) continue;
            const button = text(panel, 'button', `${action} 미지원`);
            button.type = 'button';
            button.disabled = true;
          }
        }
      };
      const draw = () => {
        list.replaceChildren();
        detail.replaceChildren();
        const shown = records.filter(event =>
          (kindFilter.value === 'all' || event.kind === kindFilter.value)
          && (appFilter.value === 'all' || event.appId === appFilter.value)
          && (accessFilter.value === 'all' || event.state?.access === accessFilter.value));
        count.textContent = `표시 ${shown.length}건 / 받은 기록 ${records.length}건`;
        drawTrend(shown);
        if (shown.length === 0) text(list, 'li', '선택한 필터에 해당하는 기록이 없습니다.');
        for (const event of shown) {
          const row = text(list, 'li', '');
          row.setAttribute('data-student-event-id', event.id);
          Object.assign(row.style, panelStyle);
          text(row, 'p', `사건 ID: ${value(event.id)} · 시각: ${value(event.at)}`);
          text(row, 'p', `종류: ${kindLabel(event.kind)} · 업무 앱: ${appLabel(event.appId)}`);
          text(row, 'p', `요약: ${value(event.summary)}`);
          const button = text(row, 'button', `${value(event.id)} 상세`);
          button.type = 'button';
          button.addEventListener('click', () => showDetail(event));
        }
      };
      for (const select of [kindFilter, appFilter, accessFilter]) select.addEventListener('change', draw);
      draw();
      return root;
      };
      const root = document.createElement('div');
      root.style.fontSize = '1rem';
      root.style.lineHeight = '1.65';
      const text = (parent, tag, content) => {
        const node = polish(document.createElement(tag), tag);
        node.textContent = content;
        parent.appendChild(node);
        return node;
      };
      text(root, 'h3', '기록 추이와 목록').style.fontSize = '1.2rem';
      text(root, 'p', '학생 작성 추이·필터·상세입니다. 재조회는 이 학생 기록 영역만 갱신하며 제공 화면·PC 실측·SDP 도움정보는 갱신하지 않습니다.');
      const button = text(root, 'button', '기록 다시 조회');
      button.type = 'button';
      button.style.fontSize = '1rem';
      button.style.padding = '0.6rem 1rem';
      Object.assign(button.style, { background: 'var(--accent, #4f46a5)', color: '#ffffff', borderColor: 'var(--accent, #4f46a5)' });
      const notice = text(root, 'p', '');
      Object.assign(notice.style, { padding: '0.75rem', marginBlock: '0.8rem', borderRadius: '10px', background: '#f1f4fa', border: '1px solid #dce2ef' });
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      const resultTime = text(root, 'p', '응답 시각: 확인 불가 · 최초 제공 입력에는 시각이 전달되지 않습니다.');
      resultTime.style.fontVariantNumeric = 'tabular-nums';
      const content = text(root, 'div', '');
      const available = typeof api?.get === 'function';
      const mount = {
        reset() {
          button.setAttribute('aria-disabled', String(!available));
          root.setAttribute('aria-busy', 'false');
          notice.textContent = available ? '자동 조회하지 않습니다. 버튼을 누르면 받은 기록을 새로 조회하고 필터·상세를 초기화합니다.'
            : '학생 재조회 API를 사용할 수 없습니다. 위쪽 제공 「다시 불러오기」를 사용하세요.';
        },
      };
      eventMount = mount;
      content.appendChild(renderRecords(input));
      mount.reset();
      if (eventQueryPending) {
        button.setAttribute('aria-disabled', 'true');
        notice.textContent = '이전 학생 기록 요청 정리 중… 현재 제공 입력을 우선 표시합니다.';
      }
      // 네이티브 버튼을 DOM에 유지하고 aria-disabled와 실행 가드로 중복 요청을 막습니다.
      // Tab으로 다른 곳에 이동한 사용자의 초점을 완료 시 강제로 옮기지 않습니다.
      const safe = value => typeof value === 'string' && value.length > 0 && value.length <= 2000
        && !/(?:Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|access_token|api[_ -]?key)\s*[:=])/i.test(value) ? value : '확인 불가';
      const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
      const isId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value);
      const isText = value => typeof value === 'string' && value.length <= 2000;
      const textRow = row => isRecord(row) && isId(row.id) && isText(row.text);
      const validEvents = rows => Array.isArray(rows) && rows.length <= 40
        && rows.every(row => isRecord(row) && isId(row.id)
          && ['access', 'xdr'].includes(row.kind) && typeof row.at === 'string' && Number.isFinite(Date.parse(row.at))
          && isText(row.summary) && (row.appId == null || isId(row.appId))
          && Array.isArray(row.evidence) && row.evidence.every(textRow)
          && Array.isArray(row.rules) && row.rules.every(textRow)
          && isRecord(row.state) && ['allowed', 'denied', 'unknown'].includes(row.state.access)
          && ['active', 'expired', 'revoked', 'unknown'].includes(row.state.session)
          && ['compliant', 'noncompliant', 'unknown'].includes(row.state.device)
          && Array.isArray(row.supportedActions) && row.supportedActions.every(isId))
        && new Set(rows.map(row => row.id)).size === rows.length;
      const validCoverage = (coverage, rows, requestedAt, receivedAt) => {
        const fields = ['schema', 'kind', 'scope', 'limit', 'total', 'returned', 'truncated', 'observedAtMs'];
        return isRecord(coverage) && Object.keys(coverage).length === fields.length
          && fields.every(field => Object.hasOwn(coverage, field))
          && coverage.schema === 'alekov.sdp.coverage.v1' && coverage.kind === 'events'
          && coverage.scope === 'own-recorded-events' && coverage.limit === 40
          && Number.isSafeInteger(coverage.total) && Number.isSafeInteger(coverage.returned)
          && coverage.returned === rows.length && coverage.total >= coverage.returned
          && typeof coverage.truncated === 'boolean' && coverage.truncated === (coverage.total > coverage.returned)
          && Number.isSafeInteger(coverage.observedAtMs) && coverage.observedAtMs > 0
          && coverage.observedAtMs >= requestedAt - 5000 && coverage.observedAtMs <= receivedAt + 5000
          && receivedAt - coverage.observedAtMs <= 20000;
      };
      button.addEventListener('click', async () => {
        if (!available || eventQueryPending || eventMount !== mount) return;
        eventQueryPending = true;
        button.setAttribute('aria-disabled', 'true');
        root.setAttribute('aria-busy', 'true');
        notice.textContent = '기록 조회 중… 잠시 기다려 주세요.';
        resultTime.textContent = '이번 응답 시각: 확인 불가 · 조회 중';
        content.replaceChildren(renderRecords({ status: 'loading', mode: 'unknown' }));
        let outcome;
        const requestedAt = Date.now();
        try {
          const response = await api.get('/api/events');
          const receivedAt = Date.now();
          if (eventMount !== mount) return;
          const mode = ['connected', 'demo', 'disconnected'].includes(response?.meta?.mode) ? response.meta.mode : 'unknown';
          if (response?.ok === false) {
            outcome = { status: 'error', mode, error: { code: safe(response.error?.code), message: safe(response.error?.message) } };
          } else if (response?.ok !== true || !validEvents(response.data) || mode === 'unknown'
            || (Object.hasOwn(response, 'coverage') && !validCoverage(response.coverage, response.data, requestedAt, receivedAt))) {
            outcome = { status: 'error', mode: 'unknown', error: { code: 'CONTRACT_MISMATCH', message: '기록 응답 형식 또는 조회 범위를 확인할 수 없습니다.' } };
          } else {
            outcome = { status: 'ok', mode, data: response.data };
          }
          const at = response?.meta?.checkedAt;
          const validTime = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(at) && Number.isFinite(Date.parse(at));
          resultTime.textContent = validTime ? `이번 응답 시각(checkedAt): ${at} · 기록 발생 시각이나 PC 측정 시각이 아닙니다.`
            : '이번 응답 시각: 확인 불가 · 유효한 시각이 전달되지 않았습니다.';
        } catch {
          if (eventMount !== mount) return;
          outcome = { status: 'error', mode: 'unknown', error: { code: 'STUDENT_QUERY_FAILED', message: '학생 기록 요청을 완료하지 못했습니다. 로컬 서버 실행 상태를 확인하세요.' } };
          resultTime.textContent = '이번 응답 시각: 확인 불가 · 요청을 완료하지 못했습니다.';
        } finally {
          eventQueryPending = false;
          if (eventMount === mount) {
            mount.reset();
            content.replaceChildren(renderRecords(outcome));
            notice.textContent = outcome?.status === 'ok' ? '기록 응답을 받아 학생 추이·목록을 갱신했습니다. 실제 시스템 연결 여부는 자료 출처 표시와 구분하세요.'
              : '보안 기록 조회 실패 · 아래 실패 항목과 다음 행동을 확인하세요.';
          } else {
            eventMount?.reset();
          }
        }
      });
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      // 매 입력마다 새 화면을 만들며 이전 목록·오류·도움정보는 보관하지 않습니다.
      const root = document.createElement('div');
      root.style.fontSize = '1rem';
      root.style.lineHeight = '1.65';
      const text = (parent, tag, content) => {
        const node = polish(document.createElement(tag), tag);
        if (tag === 'section') Object.assign(node.style, { ...panelStyle, marginBlock: '1rem' });
        node.textContent = content;
        if (tag === 'h3') node.style.fontSize = '1.2rem';
        parent.appendChild(node);
        return node;
      };
      // 허용 항목 안에도 인증 비밀처럼 보이는 문자열이 있으면 원문을 표시하지 않습니다.
      const secret = /(?:Bearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bsk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|\b(?:ghp_|github_pat_)[A-Za-z0-9_]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|access[_ -]?token|refresh[_ -]?token|secret|비밀번호|토큰)\s*[:=]\s*\S+)/i;
      const safe = value => typeof value !== 'string' || value.length === 0 ? '확인 불가'
        : secret.test(value) ? '민감정보 제외' : value;
      const modeLine = (parent, current) => {
        switch (current) {
          case 'connected': break;
          case 'demo': text(parent, 'p', '예시 자료 · 실제 조회 결과 아님 (demo)'); break;
          case 'disconnected': text(parent, 'p', '연결 없음 (disconnected)'); break;
          default: text(parent, 'p', '연결 상태 확인 불가 (unknown)'); break;
        }
      };
      const deviceState = status => status === 'compliant' ? '보안 기준 충족 (compliant)'
        : status === 'noncompliant' ? '보안 기준 미충족 (noncompliant)' : '확인 불가(unknown)';
      const sessionState = status => {
        switch (status) {
          case 'active': return '활성 (active)';
          case 'expired': return '만료 (expired)';
          case 'revoked': return '철회됨 (revoked)';
          default: return '확인 불가(unknown)';
        }
      };
      const failure = (parent, title, error, retry) => {
        const timeout = typeof error?.code === 'string' && /TIMEOUT|TIMED_OUT/i.test(error.code);
        text(parent, 'p', `${title} 조회 실패${timeout ? ' (시간 초과)' : ''}: ${safe(error?.message)}`);
        text(parent, 'p', retry);
      };
      modeLine(root, mode);
      // 학습용 설명만 표시합니다. PC 값은 이 함수의 입력에 없으므로 수치·시각을 생성하지 않습니다.
      const pcGuide = text(root, 'details', '');
      text(pcGuide, 'summary', 'PC 수치 읽는 법');
      text(pcGuide, 'p', '학생 작성 설명 · 실측 결과나 AI 분석이 아닙니다. 실제 값은 제공 영역 「내 PC 상태」의 「내 PC 확인」으로 조회하세요. 이 설명은 값을 수집하거나 자동 요청하지 않습니다.');
      const guideTable = text(pcGuide, 'table', '');
      text(guideTable, 'caption', '제공 PC 조회 값의 의미·단위·시각');
      const guideHead = text(text(guideTable, 'thead', ''), 'tr', '');
      for (const heading of ['항목', '뜻과 단위', '측정·비교할 때']) text(guideHead, 'th', heading).setAttribute('scope', 'col');
      const guideBody = text(guideTable, 'tbody', '');
      for (const [name, meaning, comparison] of [
        ['CPU 사용률', '약 200ms 구간의 전체 CPU 시간 대비 사용 비율(%)입니다.', '작업 관리자와 가까운 시각에 비교하세요. 표본 구간·갱신 주기가 달라 수치가 정확히 같을 필요는 없습니다.'],
        ['메모리 사용량', '사용량 / 전체 용량입니다. 제공 화면은 GB로 표시하지만 계산 기준은 1,073,741,824바이트(1GiB)입니다.', '캐시·예약 메모리 등 집계 방식에 따라 작업 관리자와 차이가 날 수 있습니다. 같은 범위·단위인지 먼저 확인하세요.'],
        ['디스크 남은 공간', '현재 앱 폴더가 있는 디스크의 여유 공간 / 전체 용량입니다. 제공 화면의 GB는 1024³바이트 기준입니다.', '파일 탐색기의 같은 드라이브와 비교하세요. 메모리와 달리 앞 숫자는 사용량이 아니라 여유 공간입니다.']
      ]) {
        const row = text(guideBody, 'tr', '');
        text(row, 'th', name).setAttribute('scope', 'row');
        text(row, 'td', meaning);
        text(row, 'td', comparison);
      }
      text(pcGuide, 'h4', '시각과 확인 불가 읽기');
      text(pcGuide, 'p', '제공 카드 위 「이 PC 마지막 실측」은 응답을 만든 시각(measuredAt)입니다. 세 항목이 정확히 같은 순간에 측정됐다는 뜻은 아니며 항목별 시각은 별도로 제공되지 않습니다. 이 학생 설명에는 현재 PC 값과 측정 시각이 전달되지 않습니다.');
      text(pcGuide, 'p', '읽지 못한 값은 확인 불가와 표시된 이유(읽기 권한 없음·시간 초과·미지원·조회 실패)를 확인하세요. 0이나 정상으로 바꾸지 말고 예시 값으로 채우지 않습니다. 관리자 권한 실행이나 권한 변경은 이 절차에서 요청하지 않습니다.');
      text(pcGuide, 'h4', '실측과 예시 자료 구분');
      text(pcGuide, 'p', '내 PC 상태는 제공된 로컬 실측 기능입니다. demo 계정·기기·세션·event-01 기록은 예시 자료이며 실제 PC 측정 결과가 아닙니다. PC 실측 성공은 SDP 연결·AI 설명 성공이나 PC 안전을 보장하지 않습니다.');
      // SDP 진단은 제공된 수동 조회 결과만 사용합니다. PC 값·AI 상태에서 연결을 추측하지 않습니다.
      const sdp = text(root, 'section', '');
      text(sdp, 'h3', 'SDP 연결 상태');
      text(sdp, 'p', '제공 도움정보의 진단 응답 기준입니다. 내 PC 실측·AI 모델 응답 점검과 별개이며 실시간 연결 감시가 아닙니다.');
      const diagnosticData = diagnostics?.status === 'ok' && diagnostics.data
        && typeof diagnostics.data === 'object' && !Array.isArray(diagnostics.data) ? diagnostics.data : null;
      const engineMode = diagnosticData?.engine?.mode;
      const engineCode = diagnosticData?.engine?.code;
      if (diagnostics?.status === 'loading') {
        text(sdp, 'p', 'SDP 연결 상태 확인 불가 · 진단 정보 불러오는 중');
      } else if (diagnostics?.status === 'error') {
        text(sdp, 'p', `SDP 연결 상태 확인 불가 · 진단 조회 실패 · 코드: ${safe(diagnostics.error?.code)} · 이유: ${safe(diagnostics.error?.message)}`);
      } else if (!diagnosticData) {
        text(sdp, 'p', 'SDP 연결 상태 확인 불가 · 사용할 수 있는 진단 응답이 없습니다.');
      } else if (diagnostics.mode !== engineMode) {
        text(sdp, 'p', 'SDP 연결 상태 확인 불가 · 진단의 자료 모드와 엔진 모드가 일치하지 않습니다.');
      } else if (engineMode === 'demo' && engineCode === 'DEMO_ONLY') {
        text(sdp, 'p', 'SDP 미연결 · 예제 모드로 실행 중 (demo / DEMO_ONLY)');
        text(sdp, 'p', '예제 계정·기기·세션·기록은 실제 조회 결과가 아닙니다. 제공 「내 PC 상태」에서 읽은 값과 구분하세요.');
      } else if (engineMode === 'disconnected' && engineCode === 'ENGINE_NOT_CONNECTED') {
        text(sdp, 'p', 'SDP 미연결 · 연결 어댑터 미연결 상태 (disconnected / ENGINE_NOT_CONNECTED)');
      } else if (engineMode === 'connected' && engineCode === 'ADAPTER_CONFIGURED') {
        text(sdp, 'p', 'SDP 연결 설정 있음 · 실제 통신 성공 여부는 이 진단으로 확인 불가 (connected / ADAPTER_CONFIGURED)');
      } else {
        text(sdp, 'p', 'SDP 연결 상태 확인 불가 · 진단 모드·코드가 지원하는 조합이 아니거나 누락되었습니다.');
      }
      const diagnosticTime = diagnosticData?.checkedAt;
      const validDiagnosticTime = typeof diagnosticTime === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(diagnosticTime)
        && Number.isFinite(Date.parse(diagnosticTime));
      text(sdp, 'p', validDiagnosticTime ? `진단 응답 시각(checkedAt): ${diagnosticTime}`
        : '진단 응답 시각: 확인 불가 · 유효한 시각이 전달되지 않았습니다.');
      text(sdp, 'p', '최신 진단은 제공 화면의 「도움정보 불러오기」 버튼을 직접 누르세요. 자동 재요청하지 않습니다. 진단 이후 상태가 바뀔 수 있습니다.');
      const connectionGuide = text(root, 'details', '');
      text(connectionGuide, 'summary', '네트워크·방화벽·Windows 기록 읽는 법');
      text(connectionGuide, 'p', '학생 작성 설명입니다. 현재 실측값은 제공 「내 PC 상태」에서 확인하세요. 이 영역은 값을 수집하거나 설정을 바꾸지 않습니다.');
      const connectionTable = text(connectionGuide, 'table', '');
      text(connectionTable, 'caption', '제공 조회의 범위와 해석 한계');
      const connectionHead = text(text(connectionTable, 'thead', ''), 'tr', '');
      for (const heading of ['항목', '제공 조회·단위', '해석과 제한']) text(connectionHead, 'th', heading).setAttribute('scope', 'col');
      const connectionBody = text(connectionTable, 'tbody', '');
      for (const [name, scope, limit] of [
        ['네트워크 구성', '네트워크 인터페이스 개수·IPv4 구성 개수(개)', '구성 개수만 읽습니다. 유선·무선 연결, 인터넷 통신 또는 SDP·ZTNA 접근 성공을 확인한 결과가 아닙니다.'],
        ['Windows 방화벽', 'Domain·Private·Public 프로필의 켜짐·꺼짐', '설정을 읽기만 합니다. 켜짐은 PC 전체의 안전 판정이 아니며 앱은 방화벽 설정을 변경하지 않습니다.'],
        ['Windows 기록', '최근 24시간 System·Application의 경고·오류 건수(건), 최신 최대 5,000건', '침해·공격 탐지 결과가 아닙니다. 상한을 넘으면 일부 집계이며 Security 로그나 모든 Windows 로그를 조회한 결과가 아닙니다.']
      ]) {
        const row = text(connectionBody, 'tr', '');
        text(row, 'th', name).setAttribute('scope', 'row');
        text(row, 'td', scope);
        text(row, 'td', limit);
      }
      text(connectionGuide, 'p', '시각은 제공 카드 위 「이 PC 마지막 실측」의 공통 measuredAt을 확인하세요. 이 학생 영역에는 PC 값·측정 시각이 전달되지 않습니다. SDP 진단 시각과 PC 실측 시각은 서로 다른 응답의 시각입니다.');
      text(connectionGuide, 'p', '읽기 권한 없음·시간 초과·미지원·조회 실패는 확인 불가와 이유로 남깁니다. 0건·꺼짐·정상이나 예시 값으로 대체하지 않습니다. 관리자 권한 실행·권한 변경·공격 또는 침투 모의시험은 요청하지 않습니다.');
      const recovery = text(root, 'section', '');
      text(recovery, 'h3', '자료 연결과 다시 시도');
      text(recovery, 'p', '이 영역은 기기·세션·기록 알림의 조회 상태입니다. AI 모델 응답 점검과 별개이며, AI 점검 성공만으로 이 자료가 연결되지는 않습니다.');
      const failures = [['기기 목록', devices], ['현재 세션', sessions]].filter(([, input]) => input?.status === 'error');
      if (failures.length) {
        for (const [name, input] of failures) text(recovery, 'p', `${name}: 조회 실패 · 코드: ${safe(input.error?.code)}`);
        text(recovery, 'p', '다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요. 자동 재요청하지 않습니다. 연결 없음은 기기·세션 0개나 정상 상태를 뜻하지 않습니다.');
      } else {
        text(recovery, 'p', '자료별 현재 상태는 아래에 표시합니다. 최신 값이 필요하면 위쪽 「다시 불러오기」 버튼을 직접 누르세요.');
      }

      // 연결 상태와 실패·다음 행동을 설명 패널보다 먼저 표시합니다.
      root.insertBefore(sdp, pcGuide);
      root.insertBefore(recovery, pcGuide);
      const collection = (title, input, empty, renderRow) => {
        const section = text(root, 'section', '');
        text(section, 'h3', title);
        modeLine(section, input?.mode);
        if (input?.status === 'loading') {
          text(section, 'p', `${title} 불러오는 중`);
        } else if (input?.status === 'error') {
          failure(section, title, input.error, '다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요.');
        } else if (input?.status !== 'ok' || !Array.isArray(input.data)) {
          text(section, 'p', `${title} 확인 불가: 목록 응답을 확인할 수 없습니다.`);
        } else if (input.data.length === 0) {
          text(section, 'p', empty);
        } else {
          const list = text(section, 'ul', '');
          for (const row of input.data) text(list, 'li', renderRow(row));
        }
      };
      text(root, 'p', '등록 기기는 본인 명의의 회수되지 않은 기기 최대 100개입니다. 세션 조회는 현재 검증된 연결 한 개이며 과거 세션 전체 목록이 아닙니다.');
      collection('기기 목록', devices, '등록된 기기가 없습니다.',
        row => `기기: ${safe(row?.label)} · 상태: ${deviceState(row?.status)}`);
      collection('현재 세션', sessions, '현재 연결이 없습니다.',
        row => `세션 ID: ${safe(row?.id)} · 상태: ${sessionState(row?.status)}`);
      const alerts = text(root, 'section', '');
      text(alerts, 'h3', '알림');
      if (!Array.isArray(notifications)) {
        text(alerts, 'p', '알림 확인 불가');
      } else if (notifications.length === 0) {
        text(alerts, 'p', '주의할 알림이 없습니다.');
      } else {
        const list = text(alerts, 'ul', '');
        for (const item of notifications) {
          text(list, 'li', `자료(resource): ${safe(item?.resource)} · 코드(code): ${safe(item?.code)} · 안내: ${safe(item?.message)}`);
        }
      }
      const diagnostic = text(root, 'section', '');
      text(diagnostic, 'h3', '진단 도움정보');
      modeLine(diagnostic, diagnostics?.mode);
      // 진단 원문을 펼치거나 통째로 복사하지 않고 이 여섯 값만 새 객체에 담습니다.
      const source = diagnostics?.status === 'ok' && diagnostics.data
        && typeof diagnostics.data === 'object' && !Array.isArray(diagnostics.data)
        ? diagnostics.data : null;
      const help = source ? {
        requestId: safe(source.requestId),
        component: safe(source.component),
        version: safe(source.version),
        checkedAt: safe(source.checkedAt),
        engine: { mode: safe(source.engine?.mode), code: safe(source.engine?.code) },
      } : null;
      if (diagnostics?.status === 'loading') {
        text(diagnostic, 'p', '진단 정보 불러오는 중');
      } else if (diagnostics?.status === 'error') {
        failure(diagnostic, '진단 정보', diagnostics.error, '진단 정보 재시도는 제공 화면의 「도움정보 불러오기」 버튼을 직접 누르세요.');
      } else if (diagnostics?.status === 'idle') {
        text(diagnostic, 'p', '진단 정보를 아직 조회하지 않았습니다. 제공 화면의 「도움정보 불러오기」 버튼을 직접 누르세요.');
      } else if (help) {
        text(diagnostic, 'pre', JSON.stringify(help, null, 2));
      } else {
        text(diagnostic, 'p', '진단 정보 확인 불가');
      }
      text(diagnostic, 'p', '도움 요청에 사용할 진단 항목만 복사합니다. 자동 전송하지 않으며 복사는 버튼을 누를 때만 실행됩니다.');
      const copy = text(diagnostic, 'button', '도움정보 복사');
      copy.type = 'button';
      copy.disabled = help === null;
      const copyStatus = text(diagnostic, 'p', '');
      copyStatus.setAttribute('role', 'status');
      copy.addEventListener('click', async () => {
        if (!help) return;
        try {
          await navigator.clipboard.writeText(JSON.stringify(help, null, 2));
          copyStatus.textContent = '허용된 진단 항목을 클립보드에 복사했습니다.';
        } catch {
          copyStatus.textContent = '클립보드 복사를 사용할 수 없습니다. 위에 표시된 진단 항목을 직접 선택해 Ctrl+C로 복사하세요.';
        }
      });
      return root;
    },
    renderVulnerabilities({ status, mode, data, error } = {}) {
      // 호출마다 새 DOM을 반환하여 이전 표·오류·해시를 현재 결과에 섞지 않습니다.
      const root = document.createElement('div');
      const text = (parent, tag, content) => {
        const node = document.createElement(tag);
        node.textContent = content;
        parent.appendChild(node);
        return node;
      };
      const line = content => text(root, 'p', content);
      const secret = /Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN [^-]*PRIVATE KEY-----|\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+|(?:password|access_token|refresh_token|api[_ -]?key|client_secret)\s*[:=]/i;
      const safe = value => typeof value === 'string' && value.length > 0 && value.length <= 2000
        && !secret.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
        ? value : null;
      const shown = value => {
        return safe(value) ?? '확인 불가';
      };
      switch (mode) {
        case 'connected': break;
        case 'demo': line('예제 자료 (demo)'); break;
        case 'disconnected': line('연결 없음 (disconnected)'); break;
        default: line('연결 상태 확인 불가 (unknown)'); break;
      }
      line('OSV는 알려진 취약점 데이터베이스입니다. 조회 결과만으로 패키지나 앱 전체의 안전을 보장할 수 없습니다.');
      if (status === 'idle') {
        line('설치 패키지 조회 전(idle). 아직 조회하지 않았습니다.');
      } else if (status === 'loading') {
        line('설치 패키지 조회 중(loading). 이전 표는 현재 결과로 표시하지 않습니다.');
      } else if (status === 'error') {
        line(`설치 패키지 조회 실패: ${shown(error?.message)}`);
        if (error?.code != null) line(`오류 코드: ${shown(error.code)}`);
        line('조회 실패는 알려진 취약점이 없다는 뜻이 아닙니다. 제공 화면의 설치 패키지 조회 버튼을 직접 눌러 다시 시도하세요.');
      } else if (status === 'ok') {
        const labels = {
          complete: '모두 조회(complete)',
          partial: '일부 조회 실패(partial)',
          not_checked: '아직 조회 안 함(not_checked)',
          not_configured: '조회 준비 미완료(not_configured)',
          unverifiable: 'lock 파일 확인 불가(unverifiable)',
        };
        line(Object.hasOwn(labels, data?.status) ? labels[data.status] : '전체 조회 상태 확인 불가(unknown)');
        if (data?.status === 'not_configured') line('조회 대상 프로젝트 설정이 필요합니다. 대상 경로와 허용 공개 패키지 설정은 담당자가 준비합니다.');
        if (data?.status === 'not_checked') line('승인된 공개 조회 대상이 없어 조회하지 않았습니다. 취약점이 없다는 결과가 아닙니다.');
        if (data?.status === 'unverifiable') line('lock 파일을 확인할 수 없어 조회를 검증하지 못했습니다. 취약점이 없다는 결과가 아닙니다.');
        if (data?.status === 'partial') line('일부 조회 실패가 있습니다. 이미 받은 취약점 ID는 유지하며 미확인 부분을 취약점 없음으로 처리하지 않습니다.');
        if (data?.lockfileVersion != null) line(`lockfileVersion: ${Number.isSafeInteger(data.lockfileVersion) ? data.lockfileVersion : shown(data.lockfileVersion)}`);
        if (data?.lockfileHash != null) line(`lockfileHash: ${shown(data.lockfileHash)}`);
        if (data?.checkedAt != null) line(`전체 확인 시각(checkedAt): ${shown(data.checkedAt)}`);
        if (!Array.isArray(data?.packages)) {
          line('패키지 목록 확인 불가. 조회 결과를 검증할 수 없습니다.');
        } else if (data.packages.length === 0) {
          line('표시할 패키지 조회 항목이 없습니다. 빈 목록은 앱 전체에 취약점이 없다는 뜻이 아닙니다.');
        } else {
          const table = document.createElement('table');
          text(table, 'caption', '승인된 공개 패키지의 정확한 설치 버전별 OSV 조회 결과');
          const header = document.createElement('tr');
          for (const label of ['패키지 이름', '설치 버전', '조회 상태', '출처(source)', '확인 시각(checkedAt)', '취약점 ID·수정 시각(modified)']) {
            text(header, 'th', label).setAttribute('scope', 'col');
          }
          const head = document.createElement('thead');
          head.appendChild(header);
          table.appendChild(head);
          const body = document.createElement('tbody');
          const packageLabels = {
            known_vulnerabilities: '알려진 항목 있음(known_vulnerabilities)',
            none_found: '알려진 항목 없음(none_found)',
            unverifiable: '조회 확인 불가(unverifiable)',
          };
          for (const item of data.packages) {
            const row = document.createElement('tr');
            const name = shown(item?.name);
            const version = shown(item?.version);
            // 버전 범위를 설치된 정확한 버전으로 바꾸거나 추정하지 않습니다.
            const exact = typeof item?.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(item.version);
            row.setAttribute('data-student-package-name', name);
            if (exact) row.setAttribute('data-student-package-version', item.version);
            text(row, 'td', name);
            text(row, 'td', exact ? version : '확인 불가: 정확한 설치 버전이 전달되지 않았습니다.');
            const state = text(row, 'td', Object.hasOwn(packageLabels, item?.status) ? packageLabels[item.status] : '조회 상태 확인 불가(unknown)');
            const findings = Array.isArray(item?.vulnerabilities) ? item.vulnerabilities : null;
            if (!exact) text(state, 'p', '버전 확인 불가. 조회 결과를 검증할 수 없습니다.');
            if (item?.status === 'none_found') text(state, 'p', '이 패키지 버전의 조회 범위에서 알려진 항목이 없다는 뜻이며 안전을 보장하지 않습니다.');
            if (item?.status === 'unverifiable' && findings?.length) text(state, 'p', '일부 확인·전체 조회 확인 불가. 수신한 취약점 ID를 표시합니다.');
            text(row, 'td', shown(item?.source));
            text(row, 'td', shown(item?.checkedAt));
            const cell = document.createElement('td');
            if (findings?.length) {
              for (const finding of findings) text(cell, 'p', `취약점 ID: ${shown(finding?.id)} · 수정 시각(modified): ${shown(finding?.modified)}`);
            } else {
              text(cell, 'p', item?.status === 'none_found' && findings ? '조회 범위에서 알려진 항목 없음' : '표시할 취약점 ID가 없습니다. 취약점 없음으로 단정하지 않습니다.');
            }
            row.appendChild(cell);
            body.appendChild(row);
          }
          table.appendChild(body);
          root.appendChild(table);
        }
      } else {
        line('설치 패키지 조회 상태 확인 불가. 조회가 끝났거나 취약점이 없다고 판단할 수 없습니다.');
      }
      return root;
    },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
      // 현재 입력만 표시하며 과거 점검 결과나 비밀 설정을 보관하지 않습니다.
      const root = document.createElement('div');
      const line = content => {
        const node = document.createElement('p');
        node.textContent = content;
        root.appendChild(node);
      };
      const secret = /(?:Bearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bsk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|\b(?:ghp_|github_pat_)[A-Za-z0-9_]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|access[_ -]?token|refresh[_ -]?token|secret|비밀번호|토큰)\s*[:=]\s*\S+)/i;
      const safe = value => typeof value !== 'string' || value.trim().length === 0 ? '확인 불가'
        : value.length > 2000 || secret.test(value) || /https?:\/\/|\n\s*at\s|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(value)
          ? '안전하게 표시할 수 없는 정보는 제외했습니다.' : value;
      const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(error.code)
        ? error.code : 'AI_REQUEST_UNVERIFIED';
      switch (mode) {
        case 'connected': break;
        case 'demo': line('예제 자료 (demo) · 실제 AI 연결 성취가 아닙니다.'); break;
        case 'disconnected': line('연결 없음 (disconnected)'); break;
        default: line('연결 상태 확인 불가 (unknown)'); break;
      }
      if (status === 'idle') {
        line('AI 연결 점검 전');
      } else if (status === 'loading') {
        line('AI 연결 점검 중');
      } else if (status === 'ok') {
        if (data?.transportChecked !== true || !['test', 'verified'].includes(data?.audienceAuthorization)
            || !Number.isSafeInteger(data?.modelCount) || data.modelCount < 0) {
          line('AI 연결 점검 결과 확인 불가. 현재 응답을 연결 성공으로 판단하지 않습니다.');
        } else {
          line(data.audienceAuthorization === 'test'
            ? '시험 연결 점검(test) · 실제 앱 권한 확인을 뜻하지 않습니다.'
            : '앱 권한 확인 후 점검(verified)');
          line(`응답 모델 수(modelCount): ${data.modelCount}`);
          line(`점검 시각(checkedAt): ${safe(checkedAt)}`);
          if (data.modelCount === 0) line('현재 응답의 모델 수는 0개입니다. 담당자에게 모델 허용 설정을 확인하세요.');
          // explanationAccepted나 모델 목록만으로 사건 설명 성공을 만들지 않습니다.
          line('이 연결 점검에서는 사건 설명을 실행하지 않았습니다. 사건 설명은 보안 기록에서 별도로 요청하고 결과를 확인하세요.');
        }
      } else if (status === 'error') {
        line(`AI 연결 점검 실패 · 코드: ${code}`);
        line(`안내: ${safe(error?.message)}`);
        if (['ON_AI_PROVISIONING_PENDING', 'ON_AI_TRANSPORT_PENDING'].includes(code)) {
          line('권한 또는 연결 준비 중입니다. 학생 코드의 오류로 단정하지 말고 담당자에게 계정 연결과 앱 권한 준비 상태를 확인하세요.');
        } else if (['WB_CLCO_AUTH_REQUIRED', 'WB_CLCO_INVALID_TOKEN'].includes(code)) {
          line('인증 확인이 필요합니다. 계정 연결을 다시 확인하고 담당자에게 문의하세요. 인증 비밀을 복사해 입력하지 마세요.');
        } else if (code === 'WB_CLCO_ACCESS_BLOCKED') {
          line('접근이 제한됐습니다. 담당자에게 현재 계정의 앱 이용 권한을 확인하세요.');
        } else if (code === 'WB_CLCO_COHORT_BUDGET_EXHAUSTED') {
          line('반의 AI 사용량이 소진됐습니다. 담당자에게 사용량을 확인하세요.');
        } else if (code === 'WB_CLCO_LIMIT_REACHED') {
          line('AI 이용 한도에 도달했습니다. 담당자에게 이용 한도를 확인하세요.');
        } else if (code === 'WB_CLCO_SESSION_CLOSED') {
          line('현재 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.');
        } else if (code === 'WB_CLCO_RATE_LIMITED') {
          line('요청 횟수가 제한됐습니다. 잠시 뒤 직접 다시 점검하세요.');
        } else if (['WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT'].includes(code)) {
          line('응답 시간이 초과됐습니다. 연결 상태를 확인한 뒤 직접 다시 점검하세요.');
        } else if (['WB_CLCO_NETWORK_ERROR', 'NETWORK_ERROR', 'WB_CLCO_SERVER_UNAVAILABLE'].includes(code)) {
          line('네트워크 또는 서버 응답을 확인할 수 없습니다. 잠시 뒤 직접 다시 점검하세요.');
        } else if (['WB_CLCO_CANCELLED', 'REQUEST_CANCELLED', 'CANCELLED'].includes(code)) {
          line('AI 연결 점검이 취소됐습니다. 이전 응답은 현재 점검 결과가 아닙니다.');
        } else if (['ON_AI_MODEL_LIST_EMPTY', 'MODEL_NOT_CONFIGURED'].includes(code)) {
          line('사용할 수 있는 모델이 없거나 모델 설정을 확인할 수 없습니다. 담당자에게 모델 허용 설정을 확인하세요.');
        } else if (code === 'ON_AI_AUTHORIZATION_CHANGED') {
          line('점검 도중 앱 권한이 변경됐습니다. 담당자에게 현재 권한을 확인한 뒤 직접 다시 점검하세요.');
        } else {
          line('AI 연결 또는 응답을 확인할 수 없습니다. 담당자에게 현재 계정 연결·앱 권한·응답 상태를 확인하세요.');
        }
      } else {
        line('AI 연결 점검 상태 확인 불가');
      }
      line('자동으로 다시 점검하지 않습니다. 점검은 제공 화면의 「현재 API 연결 점검」 버튼을 직접 누르세요.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      // 현재 사건·응답만 사용합니다. 이전 DOM이나 설명은 보관하지 않습니다.
      const root = document.createElement('div');
      const text = (parent, tag, content) => {
        const node = document.createElement(tag);
        node.textContent = content;
        parent.appendChild(node);
        return node;
      };
      const line = content => text(root, 'p', content);
      const secret = /(?:Bearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bsk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|\b(?:ghp_|github_pat_)[A-Za-z0-9_]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|access[_ -]?token|refresh[_ -]?token|secret|비밀번호|토큰)\s*[:=]\s*\S+)/i;
      const safe = value => typeof value !== 'string' || value.trim().length === 0 ? '확인 불가'
        : value.length > 2000 || secret.test(value) || /https?:\/\/|\n\s*at\s|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(value)
          ? '안전하게 표시할 수 없는 정보는 제외했습니다.' : value;
      switch (explanation?.mode) {
        case 'connected': break;
        case 'demo': line('예제 자료 (demo) · 실제 AI 설명 실행 증거가 아닙니다.'); break;
        case 'disconnected': line('연결 없음 (disconnected)'); break;
        default: line('연결 상태 확인 불가 (unknown)'); break;
      }
      const eventId = typeof event?.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(event.id)
        && !secret.test(event.id) ? event.id : null;
      const failure = reason => {
        line(`AI 설명 실패: ${reason}`);
        if (typeof explanation?.error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(explanation.error.code)) {
          line(`오류 코드: ${explanation.error.code}`);
        }
        line('기존 보안 기록과 업무 앱 접근 판정은 그대로입니다. 자동으로 다시 요청하지 않습니다.');
        line('이 안내는 AI 설명의 실패이며 공식 과제 판정 결과가 아닙니다.');
        return root;
      };
      // event가 null이어도 먼저 실패 이유를 표시합니다.
      if (explanation?.status === 'error') {
        const code = typeof explanation.error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(explanation.error.code)
          ? explanation.error.code : 'AI_REQUEST_UNVERIFIED';
        if (code === 'ON_AI_INVALID_INPUT') line('설명에 필요한 사건 근거·규칙을 확인할 수 없습니다. 근거를 임의로 채우지 않습니다.');
        if (['CANCELLED', 'REQUEST_CANCELLED', 'WB_CLCO_CANCELLED'].includes(code)) {
          line('사건 설명 요청이 취소됐습니다. 이전 설명은 현재 결과가 아닙니다.');
        }
        return failure(safe(explanation.error?.message));
      }
      if (!eventId) {
        line('보안 기록에서 설명할 사건을 먼저 선택하세요.');
        return root;
      }
      line(`사건 ID: ${eventId}`);
      if (explanation?.status === 'idle') {
        line('이 사건의 AI 설명은 아직 요청하지 않았습니다.');
      } else if (explanation?.status === 'loading') {
        line('선택한 사건의 AI 설명을 요청하는 중입니다.');
      } else if (explanation?.status === 'ok') {
        const result = explanation.data;
        if (result?.executed === true) return failure('AI가 이미 조치를 실행했다고 답한 설명은 사용할 수 없습니다.');
        if (result?.executed !== false || result?.requiresHumanConfirmation !== true) {
          return failure('사람 확인 필요·미실행 조건을 확인할 수 없어 이 설명을 사용할 수 없습니다.');
        }
        const validText = (input, limit) => typeof input === 'string' && input.trim().length > 0
          && input.length <= limit && !secret.test(input) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input);
        const validId = input => typeof input === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(input) && !secret.test(input);
        const validRows = (rows, limit) => Array.isArray(rows) && rows.length > 0
          && rows.every(row => row && validId(row.id) && validText(row.text, limit))
          && new Set(rows.map(row => row.id)).size === rows.length;
        if (!validRows(event.evidence, 500) || !validRows(event.rules, 300)) {
          return failure('현재 사건의 근거 또는 규칙이 부족하거나 형식을 확인할 수 없습니다. 내용을 지어내지 않습니다.');
        }
        const evidence = new Map(event.evidence.map(row => [row.id, row.text]));
        const validRefs = refs => Array.isArray(refs) && refs.length > 0
          && new Set(refs).size === refs.length && refs.every(ref => validId(ref) && evidence.has(ref));
        if (!validRefs(result.evidenceIds) || result.evidenceIds.length !== evidence.size) {
          return failure('인용 근거 ID가 현재 사건의 근거와 맞지 않거나 누락·중복됐습니다. 이 설명을 사용할 수 없습니다.');
        }
        if (!validText(result.summary, 1500)) return failure('요약을 안전하게 표시할 수 없습니다.');
        if (!Array.isArray(event.supportedActions) || !event.supportedActions.every(validId)
            || !Array.isArray(result.proposals) || !result.proposals.every(proposal => proposal
              && validId(proposal.action) && event.supportedActions.includes(proposal.action)
              && validText(proposal.reason, 500) && validRefs(proposal.evidenceIds))) {
          return failure('제안의 지원 조치·이유·근거를 현재 사건과 연결할 수 없어 이 설명을 사용할 수 없습니다.');
        }
        text(root, 'h3', 'AI 설명(참고용)');
        line(result.summary);
        line(`확인 시각(checkedAt): ${safe(checkedAt)}`);
        line('AI 설명은 해석입니다. 사실 판단은 아래 근거·규칙과 연동 시스템이 알려 준 상태를 기준으로 하세요.');
        text(root, 'h4', '인용한 근거');
        const evidenceList = text(root, 'ul', '');
        for (const ref of result.evidenceIds) text(evidenceList, 'li', `${ref} — ${evidence.get(ref)}`);
        text(root, 'h4', '현재 규칙');
        const rules = text(root, 'ul', '');
        for (const rule of event.rules) text(rules, 'li', `${rule.id} — ${rule.text}`);
        text(root, 'h4', '확인 불가 상태');
        const fields = [
          ['access', '접속', ['allowed', 'denied']],
          ['session', '세션', ['active', 'expired', 'revoked']],
          ['device', '기기', ['compliant', 'noncompliant']],
        ];
        const unknown = fields.filter(([key, , known]) => !known.includes(event.state?.[key]));
        if (unknown.length === 0) line('없음');
        else {
          const states = text(root, 'ul', '');
          for (const [, label] of unknown) text(states, 'li', `${label}: 확인 불가(unknown)`);
        }
        text(root, 'h4', '조치 제안');
        if (result.proposals.length === 0) {
          line(event.supportedActions.length === 0
            ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
            : 'AI가 이 사건에 대해 제안한 조치가 없습니다.');
        } else {
          const proposals = text(root, 'ul', '');
          for (const proposal of result.proposals) {
            const item = text(proposals, 'li', '');
            text(item, 'p', `조치: ${proposal.action} · 이유: ${proposal.reason}`);
            text(item, 'p', `제안 근거 ID: ${proposal.evidenceIds.join(', ')}`);
            text(item, 'p', '사람 확인이 필요하며 아직 실행되지 않았습니다.');
          }
        }
        line('AI 설명과 제안만으로 보안 조치가 실행되지는 않습니다.');
        // 현재 사건에 연결된 모든 표시 검사를 마친 성공 결과에만 표식을 붙입니다.
        root.setAttribute('data-student-explanation-event', eventId);
      } else {
        line('AI 사건 설명 상태 확인 불가. 기존 보안 기록은 그대로입니다.');
      }
      return root;
    },
    renderAction({ status, event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
      const root = document.createElement('div');
      const line = content => {
        const paragraph = document.createElement('p');
        paragraph.textContent = content;
        root.appendChild(paragraph);
      };
      // 계약의 표시 항목만 읽습니다. 확인 티켓을 만들거나 요청을 전송하지 않습니다.
      const secret = /Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN [^-]*PRIVATE KEY-----|\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+|(?:password|access_token|refresh_token|api[_ -]?key|client_secret)\s*[:=]/i;
      const safe = value => typeof value === 'string' && value.length > 0 && value.length <= 2000
        && !secret.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
        ? value : null;
      const show = (label, value) => {
        const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : safe(value);
        if (text !== null) line(`${label}: ${text}`);
      };
      const eventId = safe(event?.id);
      const requestId = safe(receipt?.requestId);
      // 수신한 영수증에 연결 정보가 있을 때 현재 사건·조치와 다르면 효과로 표시하지 않습니다.
      const mismatched = (receipt?.eventId != null && receipt.eventId !== event?.id)
        || (receipt?.actionId != null && receipt.actionId !== actionId);
      const currentStatus = mismatched ? 'unknown' : status;
      switch (currentStatus) {
        case 'idle':
          line('아직 미실행(idle). AI 제안은 실제 보안 조치 실행이 아닙니다.');
          break;
        case 'loading':
          line('조치 준비 또는 결과 조회 중(loading). 현재 결과는 아직 확인되지 않았습니다.');
          break;
        case 'prepared':
          line('준비됨·미실행(prepared). 실제 대상과 조치를 확인한 뒤 제공 화면에서 별도로 사람 확인이 필요합니다.');
          if (!safe(confirmationExpiresAt)) line('사람 확인 기한: 확인 불가');
          break;
        case 'executing':
          line('서버에 전달 중(executing). 조치 결과는 아직 확인되지 않았습니다.');
          break;
        case 'pending':
          line('서버 접수·처리 중(pending). 접수 응답(ACK)은 실제 효과 확인이 아닙니다.');
          break;
        case 'succeeded':
          if (observation?.effectApplied === true) {
            line('효과 확인(succeeded)');
            show('관측 시각(observedAt)', observation.observedAt);
            if (!safe(observation.observedAt)) line('관측 시각: 확인 불가');
            line('effectApplied: true');
            if (!safe(receipt?.receiptId)) line('receiptId: 확인 불가');
          } else {
            line('결과 불명(unknown). 효과 관측이 확인되지 않아 성공이나 효과 없음으로 판단할 수 없습니다.');
            line('재집행하지 말고 제공 화면에서 연동 시스템 결과만 직접 재조회하세요.');
          }
          break;
        case 'denied':
          line('연동 시스템 거절(denied). 수신한 사유를 확인하세요.');
          break;
        case 'failed':
          line('연동 시스템 실패(failed). 수신한 사유를 확인하세요.');
          break;
        case 'expired':
          line('확인 기한 지남(expired). 제공 화면에서 조치를 다시 준비하고 대상을 확인하세요.');
          break;
        case 'error':
          line('요청 처리 안 됨(error). 오류 안내를 확인하세요.');
          break;
        default:
          line('결과 불명(unknown). 성공이나 효과 없음으로 판단할 수 없습니다.');
          if (mismatched) line('영수증의 사건 또는 조치가 현재 선택과 일치하지 않습니다.');
          line('재집행하지 말고 제공 화면에서 연동 시스템 결과만 직접 재조회하세요.');
          break;
      }
      show('사건 ID(event.id)', eventId);
      if (Array.isArray(event?.evidence)) {
        for (const evidence of event.evidence) show('근거 ID', evidence?.id);
      }
      show('조치 ID(actionId)', actionId);
      show('실제 대상 ID(target.id)', target?.id);
      show('대상 세대(target.generation)', target?.generation);
      show('요청 ID(requestId)', requestId);
      show('영수증 ID(receiptId)', receipt?.receiptId);
      show('결과 버전(version)', receipt?.version);
      show('사람 확인 기한(confirmationExpiresAt)', confirmationExpiresAt);
      show('안내', message);
      if (error) {
        show('오류 코드', error.code);
        show('오류 안내', error.message);
      }
      if (receipt?.replayed === true) {
        line('기존 요청의 응답 재사용(replayed: true)입니다. 새 실행으로 계산하지 않습니다.');
      }
      line('조작은 제공 화면의 버튼을 사용하세요. 조치 화면 취소는 이미 전달된 조치 효과를 되돌리지 않습니다.');
      line('실제 학생 계정의 조치 처리 연결과 결과는 아직 미확인(UNV)입니다.');
      if (eventId !== null) root.setAttribute('data-student-action-event', eventId);
      if (requestId !== null) root.setAttribute('data-student-action-request', requestId);
      return root;
    },
  };
}
