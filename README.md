# Malterlib Syntax Coloring README

## Features

* Syntaxt highlighting for Malterlib

## Configuration

Here are the recommmended colors you can put into your settings.json file:

```
{
  "editor.highlightingColorSpace": "display-p3",
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": [
          "malterlib.constant",
          "malterlib.keyword.js.bultinconstant",
          "malterlib.constant.enumerator",
          "malterlib.keyword.builtinconstant",
          "variable.other.enummember"
        ],
        "settings": {
          "foreground": "#ff85c9"
        }
      },
      {
        "scope": [
          "punctuation.definition.dictionary.begin.json.comments",
          "punctuation.separator.dictionary.pair",
          "punctuation.definition.array.end",
          "punctuation.definition.template-expression.begin",
          "punctuation.definition.template-expression.end",
          "storage.type",
          "keyword",
          "keyword.other",
          "keyword.operator",
          "keyword.operator.comparison",
          "keyword.operator.comparison.cpp",
          "keyword.operator.assignment.c",
          "keyword.operator.c",
          "keyword.operator.assignment.compound",
          "entity.other.attribute-name",
          "entity.name.operator.cpp"
        ],
        "settings": {
          "foreground": "#ffffff"
        }
      },
      {
        "scope": [
          "string.quoted.single",
          "string.quoted.single punctuation.definition.string.begin",
          "string.quoted.single punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#ff48f0"
        }
      },
      {
        "scope": [
          "string",
          "string.quoted punctuation.definition.string.begin",
          "string.quoted punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#009eff"
        }
      },
      {
        "scope": [
          "constant.character.escape"
        ],
        "settings": {
          "foreground": "#81cefe"
        }
      },
      {
        "scope": [
          "entity.name.type",
          "entity.name.type.class"
        ],
        "settings": {
          "foreground": "#b8aaff"
        }
      },
      {
        "scope": [
          "entity.name.function"
        ],
        "settings": {
          "foreground": "#26ff00"
        }
      },
      {
        "scope": [
          "constant.numeric",
          "keyword.other.unit"
        ],
        "settings": {
          "foreground": "#ff0080"
        }
      },
      {
        "scope": [
          "comment",
          "punctuation.definition.comment",
          "comment.line.double-slash"
        ],
        "settings": {
          "foreground": "#898989",
          "fontStyle": ""
        }
      },
      {
        "scope": [
          "storage.type.class.doxygen"
        ],
        "settings": {
          "foreground": "#f070b6",
          "fontStyle": ""
        }
      },
      {
        "scope": [
          "support.type.property-name.json"
        ],
        "settings": {
          "foreground": "#ffa200"
        }
      },
      {
        "scope": [
          "malterlib.variable"
        ],
        "settings": {
          "foreground": "#ffd700"
        }
      },
      {
        "scope": [
          "malterlib.entity.explicit"
        ],
        "settings": {
          "foreground": "#ffa600"
        }
      },
      {
        "scope": [
          "malterlib.tuple.explicit"
        ],
        "settings": {
          "foreground": "#d56955"
        }
      },
      {
        "scope": [
          "malterlib.namespace",
          "malterlib.namespace.explicit"
        ],
        "settings": {
          "foreground": "#d785ff"
        }
      },
      {
        "scope": [
          "malterlib.function.global.explicit"
        ],
        "settings": {
          "foreground": "#1cb900"
        }
      },
      {
        "scope": [
          "malterlib.keyword.access"
        ],
        "settings": {
          "foreground": "#ffc8ca"
        }
      },
      {
        "scope": [
          "malterlib.keyword.qualifiers"
        ],
        "settings": {
          "foreground": "#ffb680"
        }
      },
      {
        "scope": [
          "malterlib.keyword"
        ],
        "settings": {
          "foreground": "#ffffff"
        }
      },
      {
        "scope": [
          "malterlib.keyword.builtintype",
          "malterlib.keyword.builtincharactertype",
          "malterlib.keyword.builtinintegertype",
          "malterlib.keyword.builtintypemodifier",
          "malterlib.keyword.builtinvectortype",
          "malterlib.keyword.builtinfloattyp"
        ],
        "settings": {
          "foreground": "#ff5966"
        }
      },
      {
        "scope": [
          "malterlib.constant",
          "malterlib.keyword.js.bultinconstant",
          "malterlib.constant.enumerator",
          "constant.language",
          "constant.other"
        ],
        "settings": {
          "foreground": "#ff8ac5"
        }
      },
      {
        "scope": [
          "punctuation.separator.continuation.c"
        ],
        "settings": {
          "foreground": "#808080"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier.brackets"
        ],
        "settings": {
          "foreground": "#909090"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier",
          "malterlib.keyword.typename"
        ],
        "settings": {
          "foreground": "#c0c0c0"
        }
      },
      {
        "scope": [
          "malterlib.keyword.typename"
        ],
        "settings": {
          "foreground": "#c0c0c0"
        }
      },
      {
        "scope": [
          "malterlib.keyword.auto"
        ],
        "settings": {
          "foreground": "#dbd3ff"
        }
      },
      {
        "scope": [
          "malterlib.constant.private"
        ],
        "settings": {
          "foreground": "#ca97b1"
        }
      },
      {
        "scope": [
          "malterlib.constant.template"
        ],
        "settings": {
          "foreground": "#ff5bad"
        }
      },
      {
        "scope": [
          "malterlib.constant.templatefunction"
        ],
        "settings": {
          "foreground": "#ffb7db"
        }
      },
      {
        "scope": [
          "malterlib.templatetypeparam"
        ],
        "settings": {
          "foreground": "#8269ff"
        }
      },
      {
        "scope": [
          "malterlib.functiontemplatetypeparam"
        ],
        "settings": {
          "foreground": "#cdc3ff"
        }
      },
      {
        "scope": [
          "malterlib.type",
          "malterlib.type.explicit"
        ],
        "settings": {
          "foreground": "#b8aaff"
        }
      },
      {
        "scope": [
          "malterlib.concept"
        ],
        "settings": {
          "foreground": "#ffb680"
        }
      },
      {
        "scope": [
          "malterlib.member"
        ],
        "settings": {
          "foreground": "#ffa600"
        }
      },
      {
        "scope": [
          "malterlib.member.private"
        ],
        "settings": {
          "foreground": "#c59d53"
        }
      },
      {
        "scope": [
          "malterlib.member.private"
        ],
        "settings": {
          "foreground": "#c59d53"
        }
      },
      {
        "scope": [
          "malterlib.functor.local"
        ],
        "settings": {
          "foreground": "#00edae"
        }
      },
      {
        "scope": [
          "malterlib.functor.param"
        ],
        "settings": {
          "foreground": "#00e4e6"
        }
      },
      {
        "scope": [
          "malterlib.functor.param.output"
        ],
        "settings": {
          "foreground": "#36e8cd"
        }
      },
      {
        "scope": [
          "malterlib.functor.member"
        ],
        "settings": {
          "foreground": "#00f265"
        }
      },
      {
        "scope": [
          "malterlib.functor.member.private"
        ],
        "settings": {
          "foreground": "#4fc17e"
        }
      },
      {
        "scope": [
          "malterlib.function",
          "malterlib.function.explicit"
        ],
        "settings": {
          "foreground": "#26ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.private"
        ],
        "settings": {
          "foreground": "#8dd580"
        }
      },
      {
        "scope": [
          "malterlib.function.global",
          "malterlib.function.global.explicit"
        ],
        "settings": {
          "foreground": "#1cb900"
        }
      },
      {
        "scope": [
          "malterlib.macro",
          "malterlib.macro.explicit"
        ],
        "settings": {
          "foreground": "#ff7700"
        }
      },
      {
        "scope": [
          "malterlib.macro.parameter"
        ],
        "settings": {
          "foreground": "#ffbc81"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter"
        ],
        "settings": {
          "foreground": "#e6ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.output"
        ],
        "settings": {
          "foreground": "#fff54b"
        }
      },
      {
        "scope": [
          "malterlib.member.static"
        ],
        "settings": {
          "foreground": "#ff3f1c"
        }
      },
      {
        "scope": [
          "malterlib.member.static.private"
        ],
        "settings": {
          "foreground": "#d56955"
        }
      },
      {
        "scope": [
          "malterlib.global"
        ],
        "settings": {
          "foreground": "#e13819"
        }
      },
      {
        "scope": [
          "malterlib.variable"
        ],
        "settings": {
          "foreground": "#ffd700"
        }
      }
    ]
  },
  "editor.semanticTokenColorCustomizations": {
    "enabled": true,
    "rules": {
      "malterlib-keyword-control-statement": "#ffffff",
      "malterlib-keyword-casts": "#ffffff",
      "malterlib-keyword-clr": "#ffffff",
      "malterlib-keyword-exception-handling": "#ffffff",
      "malterlib-keyword-introspection": "#ffffff",
      "malterlib-keyword-namespace": "#ffffff",
      "malterlib-keyword-new-delete": "#ffffff",
      "malterlib-keyword-operator": "#ffffff",
      "malterlib-keyword-optimization": "#ffffff",
      "malterlib-keyword-other": "#ffffff",
      "malterlib-keyword-pure": "#ffffff",
      "malterlib-keyword-static-assert": "#ffffff",
      "malterlib-keyword-storage-class": "#ffffff",
      "malterlib-keyword-template": "#ffffff",
      "malterlib-keyword-this": "#ffffff",
      "malterlib-keyword-type-specification": "#ffffff",
      "malterlib-keyword-typedef": "#ffffff",
      "malterlib-keyword-using": "#ffffff",
      "malterlib-keyword-virtual": "#ffffff",
      "malterlib-preprocessor-directive": "#ffffff",
      "malterlib-keyword-typename": "#c0c0c0",
      "malterlib-keyword-property-modifiers": "#c0c0c0",
      "malterlib-keyword-access": "#ffc8ca",
      "malterlib-keyword-qualifier": "#ffb680",
      "malterlib-keyword-builtin-integer-types": "#ff5966",
      "malterlib-keyword-builtin-types": "#ff5966",
      "malterlib-keyword-builtin-character-types": "#ff5966",
      "malterlib-keyword-builtin-float-types": "#ff5966",
      "malterlib-keyword-builtin-type-modifiers": "#ff5966",
      "malterlib-keyword-builtin-vector-types": "#ff5966",
      "malterlib-template-non-type-param": "#ff5bad",
      "malterlib-template-non-type-param-pack": "#ff5bad",
      "malterlib-global-constant": "#ff8ac5",
      "malterlib-enumerator": "#ff8ac5",
      "malterlib-member-constant-public": "#ff8ac5",
      "malterlib-constant-variable": "#ff8ac5",
      "malterlib-keyword-builtin-constants": "#ff8ac5",
      "malterlib-function-template-non-type-param": "#ffb7db",
      "malterlib-function-template-non-type-param-pack": "#ffb7db",
      "malterlib-namespace": "#d785ff",
      "malterlib-template-type-param-class": "#8269ff",
      "malterlib-template-type-param-function": "#8269ff",
      "malterlib-template-template-param": "#8269ff",
      "malterlib-template-type-param-class-pack": "#8269ff",
      "malterlib-template-type-param-function-pack": "#8269ff",
      "malterlib-template-template-param-pack": "#8269ff",
      "malterlib-function-template-type-param-class": "#cdc3ff",
      "malterlib-function-template-type-param-function": "#cdc3ff",
      "malterlib-function-template-template-param": "#cdc3ff",
      "malterlib-function-template-type-param-class-pack": "#cdc3ff",
      "malterlib-function-template-type-param-function-pack": "#cdc3ff",
      "malterlib-function-template-template-param-pack": "#cdc3ff",
      "malterlib-type-interface": "#b8aaff",
      "malterlib-type": "#b8aaff",
      "malterlib-type-function": "#b8aaff",
      "malterlib-template-type": "#b8aaff",
      "malterlib-template-type-interface": "#b8aaff",
      "malterlib-enum": "#b8aaff",
      "malterlib-keyword-auto": "#dbd3ff",
      "malterlib-function-parameter-functor": "#00e4e6",
      "malterlib-function-parameter-pack-functor": "#00e4e6",
      "malterlib-function-parameter-output-functor": "#36e8cd",
      "malterlib-function-parameter-output-pack-functor": "#36e8cd",
      "malterlib-variable-functor": "#00edae",
      "malterlib-member-variable-public-functor": "#00f265",
      "malterlib-member-variable-private-functor": "#4fc17e",
      "malterlib-member-function-public": "#26ff00",
      "malterlib-member-static-function-public": "#26ff00",
      "malterlib-member-function-public-recursive": "#26ff00",
      "malterlib-member-static-function-public-recursive": "#26ff00",
      "malterlib-function": "#1cb900",
      "malterlib-static-function": "#1cb900",
      "malterlib-function-recursive": "#1cb900",
      "malterlib-static-function-recursive": "#1cb900",
      "malterlib-member-function-private": "#8dd580",
      "malterlib-member-static-function-private": "#8dd580",
      "malterlib-member-function-private-recursive": "#8dd580",
      "malterlib-member-static-function-private-recursive": "#8dd580",
      "malterlib-function-parameter": "#e6ff00",
      "malterlib-function-parameter-pack": "#e6ff00",
      "malterlib-function-parameter-output": "#fff54b",
      "malterlib-function-parameter-output-pack": "#fff54b",
      "malterlib-variable": "#ffd700",
      "malterlib-member-variable-public": "#ffa600",
      "malterlib-macro": "#ff7700",
      "malterlib-macro-parameter": "#ffbc81",
      "malterlib-member-static-variable-private": "#d56955",
      "malterlib-member-static-variable-private-functor": "#d56955",
      "malterlib-member-static-variable-public": "#ff3f1c",
      "malterlib-member-static-variable-public-functor": "#ff3f1c",
      "malterlib-global-variable": "#e13819",
      "malterlib-global-static-variable": "#e13819",
      "malterlib-global-variable-functor": "#e13819",
      "malterlib-global-static-variable-functor": "#e13819",
      "malterlib-static-variable": "#e13819",
      "malterlib-static-variable-functor": "#e13819",
      "malterlib-concept": "#ffb680",
      "malterlib-member-constant-private": "#ca97b1",
      "malterlib-member-variable-private": "#c59d53",
      "malterlib-keyword-property-modifiers-brackets": "#909090"
    }
  }
}
```

If you have a Visual Studio Code that doesn't support changing color space (or if you prefer sRGB):
```
{
  "editor.highlightingColorSpace": "srgb",
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": [
          "malterlib.constant",
          "malterlib.keyword.js.bultinconstant",
          "malterlib.constant.enumerator",
          "malterlib.keyword.builtinconstant",
          "variable.other.enummember"
        ],
        "settings": {
          "foreground": "#ff80cd"
        }
      },
      {
        "scope": [
          "punctuation.definition.dictionary.begin.json.comments",
          "punctuation.separator.dictionary.pair",
          "punctuation.definition.array.end",
          "punctuation.definition.template-expression.begin",
          "punctuation.definition.template-expression.end",
          "storage.type",
          "keyword",
          "keyword.other",
          "keyword.operator",
          "keyword.operator.comparison",
          "keyword.operator.comparison.cpp",
          "keyword.operator.assignment.c",
          "keyword.operator.c",
          "keyword.operator.assignment.compound",
          "entity.other.attribute-name",
          "entity.name.operator.cpp"
        ],
        "settings": {
          "foreground": "#ffffff"
        }
      },
      {
        "scope": [
          "string.quoted.single",
          "string.quoted.single punctuation.definition.string.begin",
          "string.quoted.single punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#ff40fd"
        }
      },
      {
        "scope": [
          "string",
          "string.quoted punctuation.definition.string.begin",
          "string.quoted punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#00a5ff"
        }
      },
      {
        "scope": [
          "constant.character.escape"
        ],
        "settings": {
          "foreground": "#70d1ff"
        }
      },
      {
        "scope": [
          "entity.name.type",
          "entity.name.type.class"
        ],
        "settings": {
          "foreground": "#bba9ff"
        }
      },
      {
        "scope": [
          "entity.name.function"
        ],
        "settings": {
          "foreground": "#00ff00"
        }
      },
      {
        "scope": [
          "constant.numeric",
          "keyword.other.unit"
        ],
        "settings": {
          "foreground": "#ff0088"
        }
      },
      {
        "scope": [
          "comment",
          "punctuation.definition.comment",
          "comment.line.double-slash"
        ],
        "settings": {
          "foreground": "#898989",
          "fontStyle": ""
        }
      },
      {
        "scope": [
          "storage.type.class.doxygen"
        ],
        "settings": {
          "foreground": "#ff6bba",
          "fontStyle": ""
        }
      },
      {
        "scope": [
          "support.type.property-name.json"
        ],
        "settings": {
          "foreground": "#ff9e00"
        }
      },
      {
        "scope": [
          "malterlib.variable"
        ],
        "settings": {
          "foreground": "#ffd500"
        }
      },
      {
        "scope": [
          "malterlib.entity.explicit"
        ],
        "settings": {
          "foreground": "#ffa200"
        }
      },
      {
        "scope": [
          "malterlib.tuple.explicit"
        ],
        "settings": {
          "foreground": "#ed6451"
        }
      },
      {
        "scope": [
          "malterlib.namespace",
          "malterlib.namespace.explicit"
        ],
        "settings": {
          "foreground": "#e982ff"
        }
      },
      {
        "scope": [
          "malterlib.function.global.explicit"
        ],
        "settings": {
          "foreground": "#00c000"
        }
      },
      {
        "scope": [
          "malterlib.keyword.access"
        ],
        "settings": {
          "foreground": "#ffc6c9"
        }
      },
      {
        "scope": [
          "malterlib.keyword.qualifiers"
        ],
        "settings": {
          "foreground": "#ffb379"
        }
      },
      {
        "scope": [
          "malterlib.keyword"
        ],
        "settings": {
          "foreground": "#ffffff"
        }
      },
      {
        "scope": [
          "malterlib.keyword.builtintype",
          "malterlib.keyword.builtincharactertype",
          "malterlib.keyword.builtinintegertype",
          "malterlib.keyword.builtintypemodifier",
          "malterlib.keyword.builtinvectortype",
          "malterlib.keyword.builtinfloattyp"
        ],
        "settings": {
          "foreground": "#ff5264"
        }
      },
      {
        "scope": [
          "malterlib.constant",
          "malterlib.keyword.js.bultinconstant",
          "malterlib.constant.enumerator",
          "constant.language",
          "constant.other"
        ],
        "settings": {
          "foreground": "#ff85c9"
        }
      },
      {
        "scope": [
          "punctuation.separator.continuation.c"
        ],
        "settings": {
          "foreground": "#808080"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier.brackets"
        ],
        "settings": {
          "foreground": "#909090"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier",
          "malterlib.keyword.typename"
        ],
        "settings": {
          "foreground": "#c0c0c0"
        }
      },
      {
        "scope": [
          "malterlib.keyword.typename"
        ],
        "settings": {
          "foreground": "#c0c0c0"
        }
      },
      {
        "scope": [
          "malterlib.keyword.auto"
        ],
        "settings": {
          "foreground": "#ddd3ff"
        }
      },
      {
        "scope": [
          "malterlib.constant.private"
        ],
        "settings": {
          "foreground": "#d595b3"
        }
      },
      {
        "scope": [
          "malterlib.constant.template"
        ],
        "settings": {
          "foreground": "#ff54b2"
        }
      },
      {
        "scope": [
          "malterlib.constant.templatefunction"
        ],
        "settings": {
          "foreground": "#ffb4dd"
        }
      },
      {
        "scope": [
          "malterlib.templatetypeparam"
        ],
        "settings": {
          "foreground": "#8868ff"
        }
      },
      {
        "scope": [
          "malterlib.functiontemplatetypeparam"
        ],
        "settings": {
          "foreground": "#cfc3ff"
        }
      },
      {
        "scope": [
          "malterlib.type",
          "malterlib.type.explicit"
        ],
        "settings": {
          "foreground": "#bba9ff"
        }
      },
      {
        "scope": [
          "malterlib.concept"
        ],
        "settings": {
          "foreground": "#ffb379"
        }
      },
      {
        "scope": [
          "malterlib.member"
        ],
        "settings": {
          "foreground": "#ffa200"
        }
      },
      {
        "scope": [
          "malterlib.member.private"
        ],
        "settings": {
          "foreground": "#ce9b4b"
        }
      },
      {
        "scope": [
          "malterlib.member.private"
        ],
        "settings": {
          "foreground": "#ce9b4b"
        }
      },
      {
        "scope": [
          "malterlib.functor.local"
        ],
        "settings": {
          "foreground": "#00f7ac"
        }
      },
      {
        "scope": [
          "malterlib.functor.param"
        ],
        "settings": {
          "foreground": "#00eeeb"
        }
      },
      {
        "scope": [
          "malterlib.functor.param.output"
        ],
        "settings": {
          "foreground": "#0eefce"
        }
      },
      {
        "scope": [
          "malterlib.functor.member"
        ],
        "settings": {
          "foreground": "#00fc5c"
        }
      },
      {
        "scope": [
          "malterlib.functor.member.private"
        ],
        "settings": {
          "foreground": "#35c67a"
        }
      },
      {
        "scope": [
          "malterlib.function",
          "malterlib.function.explicit"
        ],
        "settings": {
          "foreground": "#00ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.private"
        ],
        "settings": {
          "foreground": "#7dd879"
        }
      },
      {
        "scope": [
          "malterlib.function.global",
          "malterlib.function.global.explicit"
        ],
        "settings": {
          "foreground": "#00c000"
        }
      },
      {
        "scope": [
          "malterlib.macro",
          "malterlib.macro.explicit"
        ],
        "settings": {
          "foreground": "#ff7100"
        }
      },
      {
        "scope": [
          "malterlib.macro.parameter"
        ],
        "settings": {
          "foreground": "#ffb97a"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter"
        ],
        "settings": {
          "foreground": "#e0ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.output"
        ],
        "settings": {
          "foreground": "#fff53a"
        }
      },
      {
        "scope": [
          "malterlib.member.static"
        ],
        "settings": {
          "foreground": "#ff3715"
        }
      },
      {
        "scope": [
          "malterlib.member.static.private"
        ],
        "settings": {
          "foreground": "#ed6451"
        }
      },
      {
        "scope": [
          "malterlib.global"
        ],
        "settings": {
          "foreground": "#ff3113"
        }
      },
      {
        "scope": [
          "malterlib.variable"
        ],
        "settings": {
          "foreground": "#ffd500"
        }
      }
    ]
  },
  "editor.semanticTokenColorCustomizations": {
    "enabled": true,
    "rules": {
      "malterlib-keyword-control-statement": "#ffffff",
      "malterlib-keyword-casts": "#ffffff",
      "malterlib-keyword-clr": "#ffffff",
      "malterlib-keyword-exception-handling": "#ffffff",
      "malterlib-keyword-introspection": "#ffffff",
      "malterlib-keyword-namespace": "#ffffff",
      "malterlib-keyword-new-delete": "#ffffff",
      "malterlib-keyword-operator": "#ffffff",
      "malterlib-keyword-optimization": "#ffffff",
      "malterlib-keyword-other": "#ffffff",
      "malterlib-keyword-pure": "#ffffff",
      "malterlib-keyword-static-assert": "#ffffff",
      "malterlib-keyword-storage-class": "#ffffff",
      "malterlib-keyword-template": "#ffffff",
      "malterlib-keyword-this": "#ffffff",
      "malterlib-keyword-type-specification": "#ffffff",
      "malterlib-keyword-typedef": "#ffffff",
      "malterlib-keyword-using": "#ffffff",
      "malterlib-keyword-virtual": "#ffffff",
      "malterlib-preprocessor-directive": "#ffffff",
      "malterlib-keyword-typename": "#c0c0c0",
      "malterlib-keyword-property-modifiers": "#c0c0c0",
      "malterlib-keyword-access": "#ffc6c9",
      "malterlib-keyword-qualifier": "#ffb379",
      "malterlib-keyword-builtin-integer-types": "#ff5264",
      "malterlib-keyword-builtin-types": "#ff5264",
      "malterlib-keyword-builtin-character-types": "#ff5264",
      "malterlib-keyword-builtin-float-types": "#ff5264",
      "malterlib-keyword-builtin-type-modifiers": "#ff5264",
      "malterlib-keyword-builtin-vector-types": "#ff5264",
      "malterlib-template-non-type-param": "#ff54b2",
      "malterlib-template-non-type-param-pack": "#ff54b2",
      "malterlib-global-constant": "#ff85c9",
      "malterlib-enumerator": "#ff85c9",
      "malterlib-member-constant-public": "#ff85c9",
      "malterlib-constant-variable": "#ff85c9",
      "malterlib-keyword-builtin-constants": "#ff85c9",
      "malterlib-function-template-non-type-param": "#ffb4dd",
      "malterlib-function-template-non-type-param-pack": "#ffb4dd",
      "malterlib-namespace": "#e982ff",
      "malterlib-template-type-param-class": "#8868ff",
      "malterlib-template-type-param-function": "#8868ff",
      "malterlib-template-template-param": "#8868ff",
      "malterlib-template-type-param-class-pack": "#8868ff",
      "malterlib-template-type-param-function-pack": "#8868ff",
      "malterlib-template-template-param-pack": "#8868ff",
      "malterlib-function-template-type-param-class": "#cfc3ff",
      "malterlib-function-template-type-param-function": "#cfc3ff",
      "malterlib-function-template-template-param": "#cfc3ff",
      "malterlib-function-template-type-param-class-pack": "#cfc3ff",
      "malterlib-function-template-type-param-function-pack": "#cfc3ff",
      "malterlib-function-template-template-param-pack": "#cfc3ff",
      "malterlib-type-interface": "#bba9ff",
      "malterlib-type": "#bba9ff",
      "malterlib-type-function": "#bba9ff",
      "malterlib-template-type": "#bba9ff",
      "malterlib-template-type-interface": "#bba9ff",
      "malterlib-enum": "#bba9ff",
      "malterlib-keyword-auto": "#ddd3ff",
      "malterlib-function-parameter-functor": "#00eeeb",
      "malterlib-function-parameter-pack-functor": "#00eeeb",
      "malterlib-function-parameter-output-functor": "#0eefce",
      "malterlib-function-parameter-output-pack-functor": "#0eefce",
      "malterlib-variable-functor": "#00f7ac",
      "malterlib-member-variable-public-functor": "#00fc5c",
      "malterlib-member-variable-private-functor": "#35c67a",
      "malterlib-member-function-public": "#00ff00",
      "malterlib-member-static-function-public": "#00ff00",
      "malterlib-member-function-public-recursive": "#00ff00",
      "malterlib-member-static-function-public-recursive": "#00ff00",
      "malterlib-function": "#00c000",
      "malterlib-static-function": "#00c000",
      "malterlib-function-recursive": "#00c000",
      "malterlib-static-function-recursive": "#00c000",
      "malterlib-member-function-private": "#7dd879",
      "malterlib-member-static-function-private": "#7dd879",
      "malterlib-member-function-private-recursive": "#7dd879",
      "malterlib-member-static-function-private-recursive": "#7dd879",
      "malterlib-function-parameter": "#e0ff00",
      "malterlib-function-parameter-pack": "#e0ff00",
      "malterlib-function-parameter-output": "#fff53a",
      "malterlib-function-parameter-output-pack": "#fff53a",
      "malterlib-variable": "#ffd500",
      "malterlib-member-variable-public": "#ffa200",
      "malterlib-macro": "#ff7100",
      "malterlib-macro-parameter": "#ffb97a",
      "malterlib-member-static-variable-private": "#ed6451",
      "malterlib-member-static-variable-private-functor": "#ed6451",
      "malterlib-member-static-variable-public": "#ff3715",
      "malterlib-member-static-variable-public-functor": "#ff3715",
      "malterlib-global-variable": "#ff3113",
      "malterlib-global-static-variable": "#ff3113",
      "malterlib-global-variable-functor": "#ff3113",
      "malterlib-global-static-variable-functor": "#ff3113",
      "malterlib-static-variable": "#ff3113",
      "malterlib-static-variable-functor": "#ff3113",
      "malterlib-concept": "#ffb379",
      "malterlib-member-constant-private": "#d595b3",
      "malterlib-member-variable-private": "#ce9b4b",
      "malterlib-keyword-property-modifiers-brackets": "#909090"
    }
  }
}
```

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of Malterlib VSCode

### 1.0.1

Add support for Malterlib Build highlighting

### 1.0.2

Highlight scope bug fixes

### 1.0.3

Add support for Display P3 color space