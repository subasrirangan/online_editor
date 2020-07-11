var defaultUrl = "https://judge0.p.rapidapi.com";
var apiUrl = defaultUrl;
var check_timeout = 200;
var key_token = "80bf1b0260mshdebc3ed701f2f4ep180d42jsndda6b7b0fa8f";

var editorMode = "normal";
var redirectStderrToStdout = "true";
var editorModeObject = null;

var MonacoVim;
var MonacoEmacs;

var layout;

var sourceEditor;
var stdoutEditor;

var currentLanguageId;

var $selectLanguage;

var $runBtn;
var $navigationMessage;

var timeStart;
var timeEnd;

var layoutConfig = {
    dimensions: {
        borderWidth: 3,
        headerHeight: 22
    },
    content: [{
        type: "row",
        content: [{
            type: "component",
            componentName: "source",
            title: "SOURCE",
            isClosable: false,
            componentState: {
                readOnly: false
            }
        }, {
            type: "column",
            content: [ {
                type: "stack",
                content: [{
                        type: "component",
                        componentName: "stdout",
                        title: "STDOUT",
                        isClosable: false,
                        componentState: {
                            readOnly: true
                        }
                     }
                     
                    ]
            }
        ]
        }]
    }]
};

function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

function showError(title, content) {
    $("#site-modal #title").html(title);
    $("#site-modal .content").html(content);
    $("#site-modal").modal("show");
}

function handleError(jqXHR, textStatus, errorThrown) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

function handleRunError(jqXHR, textStatus, errorThrown) {
    handleError(jqXHR, textStatus, errorThrown);
    $runBtn.removeClass("loading");
}

function handleResult(data) {
    timeEnd = performance.now();

    var status = data.status;
    var stdout = decode(data.stdout);
    var time = (data.time === null ? "-" : data.time + "s");
    var memory = (data.memory === null ? "-" : data.memory + "KB");

    stdoutEditor.setValue(stdout);
    
    if (stdout !== "") {
        var dot = document.getElementById("stdout-dot");
        if (!dot.parentElement.classList.contains("lm_active")) {
            dot.hidden = false;
        }
    }
    
    $runBtn.removeClass("loading");
}

function run() {
    if (sourceEditor.getValue().trim() === "") {
        showError("Error", "Source code can't be empty!");
        return;
    } else {
        $runBtn.addClass("loading");
    }

    document.getElementById("stdout-dot").hidden = true;

    stdoutEditor.setValue("");
    
    var sourceValue = encode(sourceEditor.getValue());
    var languageId = resolveLanguageId($selectLanguage.val());

    if (parseInt(languageId) === 44) {
        sourceValue = sourceEditor.getValue();
    }

    var data = {
        source_code: sourceValue,
        language_id: languageId,
    };

    var sendRequest = function(data) {
        timeStart = performance.now();
        $.ajax({
            url: apiUrl + `/submissions?base64_encoded=true`,
            type: "POST",
            async: true,
            contentType: "application/json",
            beforeSend: function(xhr){xhr.setRequestHeader('x-rapidapi-key', key_token);},
            data: JSON.stringify(data),
            xhrFields: {
                withCredentials: apiUrl.indexOf("/secure") != -1 ? true : false
            },
            success: function (data, textStatus, jqXHR) {
                    setTimeout(fetchSubmission.bind(null, data.token), check_timeout); 
            },
            error: handleRunError
        });
    }

    var fetchAdditionalFiles = false;
    if (parseInt(languageId) === 82) {
        if (sqliteAdditionalFiles === "") {
            fetchAdditionalFiles = true;
            $.ajax({
                url: `https://minio.judge0.com/public/ide/sqliteAdditionalFiles.base64.txt?${Date.now()}`,
                type: "GET",
                async: true,
                contentType: "text/plain",
                success: function (responseData, textStatus, jqXHR) {
                    sqliteAdditionalFiles = responseData;
                    data["additional_files"] = sqliteAdditionalFiles;
                    sendRequest(data);
                },
                error: handleRunError
            });
        }
        else {
            data["additional_files"] = sqliteAdditionalFiles;
        }
    }

    if (!fetchAdditionalFiles) {
        sendRequest(data);
    }
}

function fetchSubmission(submission_token) {
    $.ajax({
        url: apiUrl + "/submissions/" + submission_token + "?base64_encoded=true",
        type: "GET",
        async: true,
        beforeSend: function(xhr){xhr.setRequestHeader('x-rapidapi-key', key_token);},
        success: function (data, textStatus, jqXHR) {
            if (data.status.id <= 2) { // In Queue or Processing
                setTimeout(fetchSubmission.bind(null, submission_token), check_timeout);
                return;
            }
            handleResult(data);
        },
        error: handleRunError
    });
}

function changeEditorLanguage() {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("mode"));
    currentLanguageId = parseInt($selectLanguage.val());
    $(".lm_title")[0].innerText = fileNames[currentLanguageId];
    apiUrl = resolveApiUrl($selectLanguage.val());
}

function insertTemplate() {
    currentLanguageId = parseInt($selectLanguage.val());
    sourceEditor.setValue(sources[currentLanguageId]);
    changeEditorLanguage();
}

function resolveLanguageId(id) {
    id = parseInt(id);
    return id;
}

function resolveApiUrl(id) {
    id = parseInt(id);
    return defaultUrl;
}

$(document).ready(function () {
  
    $.ajax({
        url: apiUrl + "/languages",
        type: "GET",
        async: true,
        beforeSend: function(xhr){xhr.setRequestHeader('x-rapidapi-key', key_token);},
        contentType: "application/json",
        success: function (data) {
             $.each(data,function(i,data)
             {
              var div_data="<option value="+data.id+">"+data.name+"</option>";
              $(div_data).appendTo('#select-language'); 
            });  
            }
      });
  
    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (e) {
            insertTemplate();
    });

    $runBtn = $("#run-btn");
    $runBtn.click(function (e) {
        run();
    });

    $navigationMessage = $("#navigation-message span");
    
    $("select.dropdown").dropdown();
    $(".ui.dropdown").dropdown();
    $(".ui.checkbox").checkbox();
    $(".close").on("click", function () {
        $(this).closest(".message").transition("fade");
    });

    require(["vs/editor/editor.main", "monaco-vim", "monaco-emacs"], function (ignorable, MVim, MEmacs) {
        layout = new GoldenLayout(layoutConfig, $("#site-content"));

        MonacoVim = MVim;
        MonacoEmacs = MEmacs;

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                minimap: {
                    enabled: false
                },
                rulers: [80, 120]
            });

        });

        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                theme: "vs-dark",
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                minimap: {
                    enabled: false
                }
            });

            container.on("tab", function(tab) {
                tab.element.append("<span id=\"stdout-dot\" class=\"dot\" hidden></span>");
                tab.element.on("mousedown", function(e) {
                    e.target.closest(".lm_tab").children[3].hidden = true;
                });
            });
        });

        layout.init();
    });
});

// Template Sources
var assemblySource = "\
section	.text\n\
    global _start\n\
\n\
_start:\n\
\n\
    xor	eax, eax\n\
    lea	edx, [rax+len]\n\
    mov	al, 1\n\
    mov	esi, msg\n\
    mov	edi, eax\n\
    syscall\n\
\n\
    xor	edi, edi\n\
    lea	eax, [rdi+60]\n\
    syscall\n\
\n\
section	.rodata\n\
\n\
msg	db 'hello, world', 0xa\n\
len	equ	$ - msg\n\
";

var bashSource = "echo \"hello, world\"";

var basicSource = "PRINT \"hello, world\"";

var cSource = "\
#include <stdio.h>\n\
\n\
int main(void) {\n\
    printf(\"hello, world\\n\");\n\
    return 0;\n\
}\n\
";

var csharpSource = "\
public class Hello {\n\
    public static void Main() {\n\
        System.Console.WriteLine(\"hello, world\");\n\
    }\n\
}\n\
";

var cppSource = "\
#include <iostream>\n\
\n\
int main() {\n\
    std::cout << \"hello, world\" << std::endl;\n\
    return 0;\n\
}\n\
";

var clojureSource = "(println \"hello, world\")\n";

var cobolSource = "\
IDENTIFICATION DIVISION.\n\
PROGRAM-ID. MAIN.\n\
PROCEDURE DIVISION.\n\
DISPLAY \"hello, world\".\n\
STOP RUN.\n\
";

var lispSource = "(write-line \"hello, world\")";

var dSource = "\
import std.stdio;\n\
\n\
void main()\n\
{\n\
    writeln(\"hello, world\");\n\
}\n\
";

var elixirSource = "IO.puts \"hello, world\"";

var erlangSource = "\
main(_) ->\n\
    io:fwrite(\"hello, world\\n\").\n\
";

var executableSource = "";

var fsharpSource = "printfn \"hello, world\"\n";

var fortranSource = "\
program main\n\
    print *, \"hello, world\"\n\
end\n\
";

var goSource = "\
package main\n\
\n\
import \"fmt\"\n\
\n\
func main() {\n\
    fmt.Println(\"hello, world\")\n\
}\n\
";

var groovySource = "println \"hello, world\"\n";

var haskellSource = "main = putStrLn \"hello, world\"";

var javaSource = "\
public class Main {\n\
    public static void main(String[] args) {\n\
        System.out.println(\"hello, world\");\n\
    }\n\
}\n\
";

var javaScriptSource = "console.log(\"hello, world\");";

var kotlinSource = "\
fun main() {\n\
    println(\"hello, world\")\n\
}\n\
";

var luaSource = "print(\"hello, world\")";

var objectiveCSource = "\
#import <Foundation/Foundation.h>\n\
\n\
int main() {\n\
    @autoreleasepool {\n\
        char name[10];\n\
        scanf(\"%s\", name);\n\
        NSString *message = [NSString stringWithFormat:@\"hello, %s\\n\", name];\n\
        printf(\"%s\", message.UTF8String);\n\
    }\n\
    return 0;\n\
}\n\
";

var ocamlSource = "print_endline \"hello, world\"";

var octaveSource = "printf(\"hello, world\\n\");";

var pascalSource = "\
program Hello;\n\
begin\n\
    writeln ('hello, world')\n\
end.\n\
";

var perlSource = "\
my $name = <STDIN>;\n\
print \"hello, $name\";\n\
";

var phpSource = "\
<?php\n\
print(\"hello, world\\n\");\n\
?>\n\
";

var plainTextSource = "hello, world\n";

var prologSource = "\
:- initialization(main).\n\
main :- write('hello, world\\n').\n\
";

var pythonSource = "print(\"hello, world\")";

var rSource = "cat(\"hello, world\\n\")";

var rubySource = "puts \"hello, world\"";

var rustSource = "\
fn main() {\n\
    println!(\"hello, world\");\n\
}\n\
";

var scalaSource = "\
object Main {\n\
    def main(args: Array[String]) = {\n\
        val name = scala.io.StdIn.readLine()\n\
        println(\"hello, \"+ name)\n\
    }\n\
}\n\
";

var sqliteSource = "\
SELECT\n\
    Name, COUNT(*) AS num_albums\n\
FROM artists JOIN albums\n\
ON albums.ArtistID = artists.ArtistID\n\
GROUP BY Name\n\
ORDER BY num_albums DESC\n\
LIMIT 4;\n\
";
var sqliteAdditionalFiles = "";

var swiftSource = "\
import Foundation\n\
let name = readLine()\n\
print(\"hello, \\(name!)\")\n\
";

var typescriptSource = "console.log(\"hello, world\");";

var vbSource = "\
Public Module Program\n\
   Public Sub Main()\n\
      Console.WriteLine(\"hello, world\")\n\
   End Sub\n\
End Module\n\
";

var c3Source = "\
module main;\n\
\n\
extern func void printf(char *str, ...);\n\
\n\
func int main()\n\
{\n\
    printf(\"hello, world\\n\");\n\
    return 0;\n\
}\n\
";

var javaTestSource = "\
import static org.junit.jupiter.api.Assertions.assertEquals;\n\
\n\
import org.junit.jupiter.api.Test;\n\
\n\
class MainTest {\n\
    static class Calculator {\n\
        public int add(int x, int y) {\n\
            return x + y;\n\
        }\n\
    }\n\
\n\
    private final Calculator calculator = new Calculator();\n\
\n\
    @Test\n\
    void addition() {\n\
        assertEquals(2, calculator.add(1, 1));\n\
    }\n\
}\n\
";

var mpiccSource = "\
// Try adding \"-n 5\" (without quotes) into command line arguments. \n\
#include <mpi.h>\n\
\n\
#include <stdio.h>\n\
\n\
int main()\n\
{\n\
    MPI_Init(NULL, NULL);\n\
\n\
    int world_size;\n\
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);\n\
\n\
    int world_rank;\n\
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);\n\
\n\
    printf(\"Hello from processor with rank %d out of %d processors.\\n\", world_rank, world_size);\n\
\n\
    MPI_Finalize();\n\
\n\
    return 0;\n\
}\n\
";

var mpicxxSource = "\
// Try adding \"-n 5\" (without quotes) into command line arguments. \n\
#include <mpi.h>\n\
\n\
#include <iostream>\n\
\n\
int main()\n\
{\n\
    MPI_Init(NULL, NULL);\n\
\n\
    int world_size;\n\
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);\n\
\n\
    int world_rank;\n\
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);\n\
\n\
    std::cout << \"Hello from processor with rank \"\n\
              << world_rank << \" out of \" << world_size << \" processors.\\n\";\n\
\n\
    MPI_Finalize();\n\
\n\
    return 0;\n\
}\n\
";

var mpipySource = "\
# Try adding \"-n 5\" (without quotes) into command line arguments. \n\
from mpi4py import MPI\n\
\n\
comm = MPI.COMM_WORLD\n\
world_size = comm.Get_size()\n\
world_rank = comm.Get_rank()\n\
\n\
print(f\"Hello from processor with rank {world_rank} out of {world_size} processors\")\n\
";

var nimSource = "\
echo \"hello, world\"\n\
";

var pythonForMlSource = "\
import mlxtend\n\
import numpy\n\
import pandas\n\
import scipy\n\
import sklearn\n\
\n\
print(\"hello, world\")\n\
";

var bosqueSource = "\
namespace NSMain;\n\
\n\
concept WithName {\n\
    invariant $name != \"\";\n\
\n\
    field name: String;\n\
}\n\
\n\
concept Greeting {\n\
    abstract method sayHello(): String;\n\
    \n\
    virtual method sayGoodbye(): String {\n\
        return \"goodbye\";\n\
    }\n\
}\n\
\n\
entity GenericGreeting provides Greeting {\n\
    const instance: GenericGreeting = GenericGreeting@{};\n\
\n\
    override method sayHello(): String {\n\
        return \"hello world\";\n\
    }\n\
}\n\
\n\
entity NamedGreeting provides WithName, Greeting {\n\
    override method sayHello(): String {\n\
        return String::concat(\"hello\", \" \", this.name);\n\
    }\n\
}\n\
\n\
entrypoint function main(arg?: String): String {\n\
    var val = arg ?| \"\";\n\
    if (val == \"1\") {\n\
        return GenericGreeting@{}.sayHello();\n\
    }\n\
    elif (val == \"2\") {\n\
        return GenericGreeting::instance.sayHello();\n\
    }\n\
    else {\n\
        return NamedGreeting@{name=\"bob\"}.sayHello();\n\
    }\n\
}\n\
";

var sources = {
    45: assemblySource,
    46: bashSource,
    47: basicSource,
    48: cSource,
    49: cSource,
    50: cSource,
    51: csharpSource,
    52: cppSource,
    53: cppSource,
    54: cppSource,
    55: lispSource,
    56: dSource,
    57: elixirSource,
    58: erlangSource,
    44: executableSource,
    59: fortranSource,
    60: goSource,
    61: haskellSource,
    62: javaSource,
    63: javaScriptSource,
    64: luaSource,
    65: ocamlSource,
    66: octaveSource,
    67: pascalSource,
    68: phpSource,
    43: plainTextSource,
    69: prologSource,
    70: pythonSource,
    71: pythonSource,
    72: rubySource,
    73: rustSource,
    74: typescriptSource,
    75: cSource,
    76: cppSource,
    77: cobolSource,
    78: kotlinSource,
    79: objectiveCSource,
    80: rSource,
    81: scalaSource,
    82: sqliteSource,
    83: swiftSource,
    84: vbSource,
    85: perlSource,
    86: clojureSource,
    87: fsharpSource,
    88: groovySource,
    1001: cSource,
    1002: cppSource,
    1003: c3Source,
    1004: javaSource,
    1005: javaTestSource,
    1006: mpiccSource,
    1007: mpicxxSource,
    1008: mpipySource,
    1009: nimSource,
    1010: pythonForMlSource,
    1011: bosqueSource
};

var fileNames = {
    45: "main.asm",
    46: "script.sh",
    47: "main.bas",
    48: "main.c",
    49: "main.c",
    50: "main.c",
    51: "Main.cs",
    52: "main.cpp",
    53: "main.cpp",
    54: "main.cpp",
    55: "script.lisp",
    56: "main.d",
    57: "script.exs",
    58: "main.erl",
    44: "a.out",
    59: "main.f90",
    60: "main.go",
    61: "main.hs",
    62: "Main.java",
    63: "script.js",
    64: "script.lua",
    65: "main.ml",
    66: "script.m",
    67: "main.pas",
    68: "script.php",
    43: "text.txt",
    69: "main.pro",
    70: "script.py",
    71: "script.py",
    72: "script.rb",
    73: "main.rs",
    74: "script.ts",
    75: "main.c",
    76: "main.cpp",
    77: "main.cob",
    78: "Main.kt",
    79: "main.m",
    80: "script.r",
    81: "Main.scala",
    82: "script.sql",
    83: "Main.swift",
    84: "Main.vb",
    85: "script.pl",
    86: "main.clj",
    87: "script.fsx",
    88: "script.groovy"
};
