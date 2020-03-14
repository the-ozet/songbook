import React, {
  Fragment,
  createContext,
  useState,
  useEffect,
  useReducer,
  useContext,
  useRef
} from "react";
import ReactDOM from "react-dom";
import { CSSTransition } from "react-transition-group";
import archieml from "archieml";
import marked from "marked";
import Session from "./session";
import "./main.scss";

const markedRenderer = new marked.Renderer();
markedRenderer.paragraph = function(text) {
  return text + "\n";
};

function noop() {}

const CHAPTERS = [];
const CHAPTER_NAME = "Act";
let lastUpdated = null;

const ACTION_TYPES = {
  TO_CHAPTER: "TO_CHAPTER",
  TO_SECTION: "TO_SECTION",
  TOGGLE_AUDIO: "TOGGLE_AUDIO",
  RESET: "RESET"
};

const SESSION = new Session({
  persistent: true,
  key: "bluehole"
});

const DEFAULT_STORE = {
  chapterIndex: 0,
  sectionIndex: 0,
  muted: true
};

const SAVED_STORE = SESSION.get("store") || DEFAULT_STORE;

function storeIsValid(state, field) {
  function isNum(val) {
    return typeof val === "number";
  }
  function isFieldValid(field) {
    return validators[field](state[field]);
  }

  const validators = {
    chapterIndex(val) {
      return typeof val === "number";
    },
    sectionIndex(val) {
      return val === "last" || isNum(val);
    },
    muted(val) {
      return typeof val === "boolean";
    }
  };

  if (field) {
    return isFieldValid(field);
  } else {
    const invalid = Object.keys(state).filter(field => {
      return !isFieldValid(field);
    });
    if (invalid.length) {
      console.log("INVALID FIELDS:", invalid);
      return false;
    }
    return true;
  }
}

const updateStore = (state, updates) => {
  let updated = Object.assign({}, state, updates);
  SESSION.set("store", updated);
  return updated;
};

function initStore(restoreUserState) {
  return restoreUserState && storeIsValid(SAVED_STORE)
    ? SAVED_STORE
    : DEFAULT_STORE;
}

function backToTop() {
  window.scrollTo({
    left: 0,
    top: 0,
    behavior: "auto"
  });
}

function reducer(state, action) {
  const { TO_CHAPTER, TO_SECTION, RESET, TOGGLE_AUDIO } = ACTION_TYPES;
  const { type, to } = action;

  switch (type) {
    case TO_CHAPTER:
      return updateStore(state, {
        chapterIndex: to,
        sectionIndex: 0
      });
      updateStore(state, {
        sectionIndex: to
      });
    case TO_SECTION:
      return updateStore(state, {
        sectionIndex: to
      });
    case RESET:
      return updateStore(state, { ...DEFAULT_STORE });
    case TOGGLE_AUDIO:
      return updateStore(state, {
        muted: !state.muted
      });
    default:
      throw new Error("action not found");
  }
}

function fetchChapters() {
  return fetch(`json/toc.json`)
    .then(response => {
      return response.json();
    })
    .then(json => {
      const { contents, updatedAt } = json;
      contents.forEach(c => CHAPTERS.push(c));
      lastUpdated = updatedAt;
    });
}

const StoryContext = createContext({
  ...DEFAULT_STORE,
  dispatch: noop
});

function Story(props) {
  const [state, dispatch] = useReducer(reducer, true, initStore);
  const contextValue = {
    ...state,
    dispatch
  };
  const { chapterIndex } = state;
  if (!CHAPTERS[chapterIndex]) {
    return null;
  }

  const chapterProps = {
    chapterCount: CHAPTERS.length,
    key: `chapter-${chapterIndex}`,
    fileName: CHAPTERS[chapterIndex].fileName
  };
  return (
    <div className="story">
      <StoryContext.Provider value={contextValue}>
        <Chapter {...chapterProps} />
      </StoryContext.Provider>
    </div>
  );
}

function Chapter(props) {
  const { fileName, chapterCount } = props;
  const { sectionIndex, chapterIndex, dispatch } = useContext(StoryContext);
  const [chapterText, setChapterText] = useState(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterType, setChapterType] = useState("");
  const [sections, setSections] = useState([]);

  useEffect(() => {
    if (chapterText === null) {
      fetchChapterText();
    }
    if (sections.length && sectionIndex === "last") {
      dispatch({
        type: ACTION_TYPES.TO_SECTION,
        to: sections.length - 1
      });
    }
  });

  useEffect(backToTop, [chapterIndex]);

  function getChapterName() {
    switch (chapterType) {
      case "cover":
        return null;
      case "appendix":
        return "Appendix";
      default:
        return CHAPTER_NAME;
    }
  }

  function getChapterNumber() {
    console.log("my chapter type?", chapterType, chapterTitle, CHAPTERS);
    const number = CHAPTERS.filter(c => c.type === chapterType).findIndex(
      c => c.title === chapterTitle
    );
    return (number || 0) + 1;
  }

  function fetchChapterText() {
    return fetch(`aml/${fileName}.aml`)
      .then(response => {
        return response.text();
      })
      .then(text => {
        setChapterText(text);
        const json = archieml.load(text);
        const { title, type = "chapter" } = json;
        const sections = json.sections.map(id => json[id]);
        setChapterTitle(title);
        setChapterType(type);
        setSections(sections);
        return sections;
      });
  }

  const showChapterTitle = displayChapterTitle();

  function displayChapterTitle() {
    if (chapterTitle && sectionIndex === 0) {
      const chapterName = getChapterName();
      const number = !chapterName ? null : (
        <span className="chapter-number">
          {chapterName} {getChapterNumber()}
        </span>
      );
      return (
        <h2>
          {number}
          <span className="chapter-title">{chapterTitle}</span>
        </h2>
      );
    } else {
      return null;
    }
  }

  return (
    <div className="chapter" data-slug={fileName}>
      <div className="mask" />
      <Header chapterTitle={showChapterTitle ? null : chapterTitle} />
      <div className="content">
        {showChapterTitle}
        <Section lines={sections[sectionIndex]} index={sectionIndex} />
      </div>
      <Pagination
        sectionCount={sections.length}
        sectionIndex={sectionIndex}
        chapterCount={chapterCount}
        chapterIndex={chapterIndex}
      />
    </div>
  );
}

function TableOfContents(props) {
  const { dispatch } = useContext(StoryContext);
  const [inProp, setInProp] = useState(false);

  useEffect(() => setInProp(true));

  const byType = CHAPTERS.reduce((acc, c, i) => {
    const { type, title, fileName } = c;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push({ ...c, index: i });
    return acc;
  }, {});

  function toChapter(e) {
    dispatch({
      type: ACTION_TYPES.TO_CHAPTER,
      to: parseInt(e.target.getAttribute("data-chapter-index"), 10)
    });
  }

  function renderList(type, header) {
    const children = byType[type];
    if (!children || !children.length) {
      return null;
    }
    return (
      <Fragment>
        {header ? <header>{header}</header> : null}
        <ol className={`toc-section-${type}`}>
          {children.map(c => {
            const props = {
              "data-chapter-index": c.index,
              key: `${c.type}-${c.index}`,
              onClick: toChapter
            };
            return <li {...props}>{c.title}</li>;
          })}
        </ol>
      </Fragment>
    );
  }
  return (
    <CSSTransition
      unmountOnExit
      in={inProp}
      timeout={300}
      classNames="table-of-contents"
    >
      <div className="table-of-contents">
        <header>Table of Contents</header>
        {renderList("cover")}
        {renderList("chapter", `${CHAPTER_NAME}s`)}
        {renderList("appendix", `Appendices`)}
      </div>
    </CSSTransition>
  );
}

function Header(props) {
  return (
    <div className="chapter-header">
      <header className="chapter-header">{props.chapterTitle}</header>
    </div>
  );
}

function Pagination(props) {
  const { sectionIndex, chapterIndex, muted, dispatch } = useContext(
    StoryContext
  );
  const [showTOC, setShowTOC] = useState(false);
  const { chapterCount, sectionCount } = props;
  const { TO_SECTION, TO_CHAPTER, TOGGLE_AUDIO } = ACTION_TYPES;
  let next = noop;
  let prev = noop;

  if (sectionIndex < sectionCount - 1) {
    next = nextSection;
  } else if (chapterIndex < chapterCount - 1) {
    next = nextChapter;
  }

  if (sectionIndex > 0) {
    prev = prevSection;
  } else if (chapterIndex > 0) {
    prev = prevChapter;
  }

  function goTo(to, type) {
    dispatch({ type, to });
  }

  function toSection(i) {
    goTo(i, TO_SECTION);
  }

  function toChapter(i) {
    goTo(i, TO_CHAPTER);
  }

  function nextSection() {
    toSection(sectionIndex + 1);
  }

  function prevSection() {
    toSection(sectionIndex - 1);
  }

  function nextChapter() {
    toChapter(chapterIndex + 1);
  }

  function prevChapter() {
    toChapter(chapterIndex - 1);
    toSection("last");
  }

  function toggleAudio() {
    dispatch({ type: TOGGLE_AUDIO });
  }

  function scrollBy(top) {
    window.scrollBy({
      top,
      left: 0,
      behavior: "smooth"
    });
  }

  function up() {
    scrollBy(-window.innerHeight);
  }

  function down() {
    scrollBy(window.innerHeight);
  }

  function toggleTOC() {
    setShowTOC(!showTOC);
  }

  function inactiveClass(action) {
    return action === noop ? "inactive" : "";
  }

  return (
    <div className="pagination">
      {showTOC ? <TableOfContents /> : null}
      <div className="toggle-toc">
        <button onClick={toggleTOC}>TOC</button>
      </div>
      <button onClick={prev} className={inactiveClass(prev)}>
        Back
      </button>
      <div className="pager">
        <button onClick={up}>⤒</button>
        <button onClick={down}>⤓</button>
      </div>
      <button onClick={next} className={inactiveClass(next)}>
        Next
      </button>
      <div className={`audio-control ${muted ? "muted" : "on"}`}>
        <button onClick={toggleAudio}></button>
      </div>
    </div>
  );
}

function Section(props) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const { lines = [], index } = props;
  const { muted } = useContext(StoryContext);
  const [inProp, setInProp] = useState(false);
  const [transitionDuration, settransitionDuration] = useState(300);
  const audioContext = useRef(new AudioContext());
  const audioElem = useRef(null);
  const audioSource = useRef(null);
  const gainNode = useRef(null);

  useEffect(() => {
    backToTop();
    // THIS SEEMS CRAAAZY.
    settransitionDuration(0);
    setInProp(false);
    setTimeout(() => {
      settransitionDuration(300);
      setInProp(true);
    }, transitionDuration);
  }, [index]);

  useEffect(() => {
    const el = audioElem.current;
    const context = audioContext.current;
    let source = audioSource.current;
    let gain = gainNode.current;

    if (el && !source) {
      source = context.createMediaElementSource(el);
      gain = context.createGain();
      source.connect(gain).connect(context.destination);
      audioSource.current = source;
      gainNode.current = gain;
    }

    if (el && source) {
      if (muted && !el.paused) {
        fade(0, -0.1).then(() => el.pause());
      } else if (!muted && el.paused) {
        fade(1, 0.1);
        el.play();
      }
    }
  });

  function fade(to = 1, increment = 0.1) {
    let direction = "out";
    if (increment > 0) {
      gainNode.current.gain.value = 0;
      direction = "in";
    }

    return new Promise((resolve, reject) => {
      function doFade() {
        const node = gainNode.current;
        const more =
          direction === "in" ? node.gain.value < to : node.gain.value > to;
        if (more) {
          node.gain.value += increment;
          window.setTimeout(doFade, 200);
        } else {
          resolve();
        }
      }

      doFade();
    });
  }

  const renderLines = lines.map((l, i) => {
    const { type, value } = l;
    const lineProps = {
      key: `line-${i}`
    };
    switch (type) {
      case "title":
        return (
          <h3 {...lineProps} className="section-title">
            {value}
          </h3>
        );
      case "video-bg":
        return (
          <div className="video-bg">
            <video
              {...lineProps}
              src={`video/${value}`}
              loop={true}
              muted={true}
              controls={false}
              autoPlay={true}
            />
          </div>
        );
      case "image-bg":
        return (
          <div
            {...lineProps}
            className="image-bg"
            style={{ backgroundImage: `url(images/${value})` }}
          />
        );
      case "audio-bg":
        return (
          <audio {...lineProps} ref={audioElem}>
            <source src={`audio/${value}`} type="audio/mp3" loop={true} />
          </audio>
        );
      case "image-bg-grainy":
        return (
          <div
            {...lineProps}
            className="image-bg grainy"
            style={{ backgroundImage: `url(images/${value})` }}
          />
        );
      case "image":
        return (
          <figure className="image-inset" {...lineProps}>
            <img src={`images/${value}`} />
          </figure>
        );
      case "video":
        return (
          <figure className="video-inset" {...lineProps}>
            <video
              src={`video/${value}`}
              loop={true}
              muted={muted}
              controls={true}
              autoPlay={true}
            />
          </figure>
        );
      case "catalog":
        // return null;
        // TK TK TK
        const tds = value.split("~").map((col, i) => {
          return <td key={`col-${i}`}>{col}</td>;
        });
        return (
          <table className="catalog">
            <thead>
              <tr>
                <th>Tape#</th>
                <th>Date</th>
                <th>Location</th>
                <th>Ftg.</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>{tds}</tr>
            </tbody>
          </table>
        );
      default:
        const html = { __html: marked(value, { renderer: markedRenderer }) };
        return <p {...lineProps} dangerouslySetInnerHTML={html}></p>;
    }
  });

  return (
    <CSSTransition
      unmountOnExit
      in={inProp}
      timeout={transitionDuration}
      classNames="section"
    >
      <div>{renderLines}</div>
    </CSSTransition>
  );
}

fetchChapters().then(() => {
  ReactDOM.render(<Story />, document.getElementById("story-container"));
});
