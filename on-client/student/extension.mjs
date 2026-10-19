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
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
