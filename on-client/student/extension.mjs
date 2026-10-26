// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      // 호출마다 새 요소를 반환합니다. 이전 입력이나 DOM을 보관하지 않습니다.
      const root = document.createElement('div');
      const text = (parent, tag, value) => {
        const element = document.createElement(tag);
        element.textContent = value;
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
        const container = text(root, 'section', '');
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
    renderEvents({ status, mode, data, error } = {}) {
      // 입력마다 새 DOM과 선택 상태를 만듭니다. 원본 목록은 변경하지 않습니다.
      const root = document.createElement('div');
      const text = (parent, tag, content) => {
        const node = document.createElement(tag);
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
        case 'demo': text(root, 'p', '예제 자료 (demo)'); break;
        case 'disconnected': text(root, 'p', '연결 없음 (disconnected)'); break;
        default: text(root, 'p', '연결 상태 확인 불가 (unknown)'); break;
      }
      if (status === 'loading') {
        text(root, 'p', '기록을 불러오는 중');
        return root;
      }
      if (status === 'error') {
        text(root, 'p', `기록을 불러오지 못했습니다: ${value(error?.message)}`);
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
      const makeFilter = (name, values, labelFor) => {
        const label = text(filters, 'label', name);
        const select = document.createElement('select');
        select.setAttribute('aria-label', name);
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
      const count = text(root, 'p', '');
      const list = text(root, 'ul', '');
      const detail = text(root, 'div', '');
      const showDetail = event => {
        detail.replaceChildren();
        const panel = text(detail, 'section', '');
        panel.setAttribute('data-student-event-detail', event.id);
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
        if (shown.length === 0) text(list, 'li', '선택한 필터에 해당하는 기록이 없습니다.');
        for (const event of shown) {
          const row = text(list, 'li', '');
          row.setAttribute('data-student-event-id', event.id);
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
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      // 매 입력마다 새 화면을 만들며 이전 목록·오류·도움정보는 보관하지 않습니다.
      const root = document.createElement('div');
      const text = (parent, tag, content) => {
        const node = document.createElement(tag);
        node.textContent = content;
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
          case 'demo': text(parent, 'p', '예제 자료 (demo)'); break;
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
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
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
