MODULE waterresistance
    ! --- Location coordinates ---
    LOCAL VAR robtarget hometarget;    
    PERS robtarget PT1:=[[523.199677467346, -251.17152929306, 4.50337491929531], [0.165287181735039, -0.677399098873138, 0.691899657249451, -0.187311083078384], [-1, -1, -1, 1], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT2:=[[600.623905658722, 171.604663133621, 104.741141200066], [0.259875923395157, -0.962172746658325, 0.0340017229318619, -0.0743771716952324], [-1, -2, -1, 1], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT3:=[[591.986238956451, 76.9183561205864, 136.074528098106], [0.32128182053566, -0.910405397415161, 0.219331130385399, -0.14083257317543], [-1, -1, -1, 1], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT4:=[[508.261799812317, 280.591130256653, 219.282239675522], [0.000556085375137627, -0.714351236820221, 0.699746012687683, -0.00758274737745523], [0, -1, -1, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT5:=[[508.277058601379, 53.5674206912518, 219.277247786522], [0.000537607877049595, -0.714327812194824, 0.699769973754883, -0.00758235901594162], [0, -1, -1, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT4_1:=[[405.788898468018, -98.5679179430008, 461.051851511002], [0.0000297923197649652, -0.718347072601318, 0.695684909820557, -0.000156566442456096], [-1, -1, -2, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT4_2:=[[424.366325139999, 390.97997546196, 449.718713760376], [0.000328324997099116, 0.717900633811951, -0.696145176887512, 0.000662661273963749], [0, -1, -1, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT6:=[[508.278846740723, 53.6009594798088, 131.567940115929], [0.000535791041329503, -0.714365541934967, 0.699731409549713, -0.0075836437754333], [0, -1, -1, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT7:=[[731.544554233551, 120.388053357601, 66.0800188779831], [0.322670429944992, -0.909008920192719, 0.220355898141861, -0.145016625523567], [-1, -1, -1, 1], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    
    ! New coordinates for pass/fail sorting
    PERS robtarget PT8:=[[542.506396770477, -256.327718496323, 3.05172405205667], [0.00448862183839083, -0.718384265899658, 0.695573329925537, -0.00903564412146807], [-1, 0, -2, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT9:=[[538.836240768433, -89.0830457210541, 35.459641367197], [0.0000193293817574158, -0.703068912029266, -0.711121737957001, 0.0000200877966562985], [-1, -1, 0, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget PT10:=[[539.493024349213, -89.0951901674271, 4.2499634437263], [0.0000153685250552371, -0.703074336051941, -0.711116373538971, 0.00001899829658214], [-1, -1, 0, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];

    ! --- Communication definitions ---
    VAR socketdev wr_sock;
    CONST string WR_SERVER_IP := "10.105.1.15";
    CONST num   WR_SERVER_PORT := 12344; ! Using 12344 to avoid conflict if both apps run
    VAR string  wr_rxStr;

    PROC CloseSocketWR()
        SocketClose wr_sock;
    ENDPROC

    PROC watchpicking()
        MoveJ Camerahomepos, v500, fine, CameraMechMind;
        MoveJ PT1, v100, fine, CameraMechMind;
        Z_GRIP 1, 1, FALSE;
        MoveJ PT3, v100, fine, CameraMechMind;
        MoveJ PT2, v100, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
        MoveJ PT3, v500, fine, CameraMechMind;
        MoveJ PT4_1, v500, fine, CameraMechMind;
        MoveJ PT4_2, v500, fine, CameraMechMind;
        MoveJ PT4, v500, fine, CameraMechMind;
        MoveJ PT5, v500, fine, CameraMechMind;
        MoveJ PT6, v500, fine, CameraMechMind;
        MoveJ PT3, v500, fine, CameraMechMind;
    ENDPROC

    PROC pressbutton()
        Z_GRIP 1, 1, FALSE;
        MoveJ PT7, v500, fine, CameraMechMind;
        ! Send signal to PC that the button is physically pressed right now
        SocketSend wr_sock \Str:="button_pressed";
        MoveJ Camerahomepos, v500, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
    ENDPROC

    PROC pass_routine()
        MoveJ PT2, v100, fine, CameraMechMind;
        Z_GRIP 1, 1, FALSE;
        MoveJ PT1, v100, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
        MoveJ Camerahomepos, v500, fine, CameraMechMind;
    ENDPROC

    PROC fail_routine()
        MoveJ PT3, v500, fine, CameraMechMind;
        MoveJ PT2, v100, fine, CameraMechMind;
        Z_GRIP 1, 1, FALSE;
        MoveJ PT1, v100, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
        MoveJ PT3, v500, fine, CameraMechMind;
        MoveJ PT8, v500, fine, CameraMechMind;
        Z_GRIP 1, 1, FALSE;
        MoveJ PT9, v500, fine, CameraMechMind;
        MoveJ PT10, v500, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
        MoveJ Camerahomepos, v500, fine, CameraMechMind;
    ENDPROC

    ! ===== MAIN ORCHESTRATOR PROCEDURE =====
    PROC WROrchestrator()
        TPWrite "Connecting to server...";
        SocketCreate wr_sock;
        SocketConnect wr_sock, WR_SERVER_IP, WR_SERVER_PORT;
        TPWrite "Connected.";
        TPWrite "Task: starting.";

        WHILE TRUE DO
            ! Tell server we are ready for a new command
            WaitTime 1;
            SocketSend wr_sock \Str:="ready";
            
            ! Wait a moment before receiving (allows Python to process)
            WaitTime 0.2;

            ! Receive message
            wr_rxStr := "";
            SocketReceive wr_sock \Str:=wr_rxStr;

            IF wr_rxStr = "WATCH_PICK" THEN
                TPWrite "Requested to run watchpicking";
                watchpicking;
                
            ELSEIF wr_rxStr = "PRESS_BTN" THEN
                TPWrite "Requested to press button";
                pressbutton;

            ELSEIF wr_rxStr = "TEST_PASS" THEN
                TPWrite "Test Passed! Executing pass routine.";
                pass_routine;
                
            ELSEIF wr_rxStr = "TEST_FAIL" THEN
                TPWrite "Test Failed! Executing fail routine.";
                fail_routine;

            ELSEIF wr_rxStr = "wait" THEN
                TPWrite "Waiting...";
                WaitTime 1;

            ELSE
                TPWrite "Unknown task:";
                TPWrite wr_rxStr;
            ENDIF
        ENDWHILE

        CloseSocketWR;
        TPWrite "WROrchestrator: done.";
    ERROR
        TPWrite "Error " + ValToStr(ERRNO) + " in WROrchestrator().";
        CloseSocketWR;
    ENDPROC

ENDMODULE
