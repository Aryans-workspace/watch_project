MODULE WR2
    LOCAL VAR robtarget hometarget;    
    PERS robtarget a1:=[[466.111958026886, -305.154204368591, -16.9989801943302], [0.0000208882920560427, 0.88543701171875, -0.464759439229965, 0.0000291095511784079], [-1, -1, -2, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget a2:=[[551.502287387848, 54.7432862222195, 75.2053558826447], [0.0000181374743988272, -0.885448515415192, 0.464737504720688, -0.0000728203158359975], [0, -1, -2, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget lift:=[[578.492522239685, 56.8298138678074, 83.5699513554573], [0.0000403030862798914, 0.914371907711029, -0.404875218868256, -0.0000863855821080506], [0, 0, -2, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget lift2:=[[487.528532743454, -304.970026016235, 49.3929535150528], [3.42869753922059e-7, -0.914387106895447, 0.404841005802155, 0.000080163219536189], [-1, -1, -2, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget a3:=[[549.657821655273, 330.642580986023, 177.450597286224], [0.000199213362066075, 0.894593000411987, -0.446876645088196, 0.00213850196450949], [0, -1, -1, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];
    PERS robtarget a4:=[[447.494626045227, 187.101528048515, 31.4323604106903], [0.0000714114794391207, -0.395815998315811, -0.918329834938049, 0.0000779378824518062], [0, -1, 0, 0], [9000000000, 9000000000, 9000000000, 9000000000, 9000000000, 9000000000]];

    ! --- Communication definitions ---
    VAR socketdev wr2_sock;
    CONST string WR2_SERVER_IP := "10.105.2.102";
    CONST num   WR2_SERVER_PORT := 12344;
    VAR string  wr2_rxStr;

    PROC CloseSocketWR2()
        SocketClose wr2_sock;
    ENDPROC

    ! Helper procedure to get target for slot
    PROC GetSlotTarget(num slotIndex, INOUT robtarget current_target)
        IF slotIndex = 1 THEN
            current_target := a1;
        ELSEIF slotIndex = 2 THEN
            current_target := Offs(a1, 0, 55, 0);
        ELSEIF slotIndex = 3 THEN
            current_target := Offs(a1, 57, 57, 0);
        ELSEIF slotIndex = 4 THEN
            current_target := Offs(a1, 57, 0, 0);
        ENDIF
    ENDPROC

    ! 1. Watch pickup and place in WR machine
    PROC pickup_and_place(num slotIndex)
        VAR robtarget current_a1;
        GetSlotTarget slotIndex, current_a1;
        WaitTime 5;
        MoveL Camerahomepos, v100, fine, CameraMechMind;
        MoveL Offs (current_a1, 0, 0, 200), v100, fine, CameraMechMind;
        MoveL current_a1, v100, fine, CameraMechMind;
        Z_GRIP 1, 1, FALSE;
        MoveL Offs (current_a1, 0, 0, 200), v100, fine, CameraMechMind;
        MoveL a2, v100, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
        MoveL Offs (a2, 0, 0, 5), v100, fine, CameraMechMind;
        MoveL Offs (a2, 0, -20, 20), v100, fine, CameraMechMind;
    ENDPROC

    ! 2. Close WR machine lid
    PROC close_lid()
        MoveL Camerahomepos, v100, fine, CameraMechMind;
        MoveL Offs (a3, 0, 0, 200), v100, fine, CameraMechMind;
        MoveL a3, v100, fine, CameraMechMind;
        MoveL Offs (a3, 0, -400, 00), v100, fine, CameraMechMind;
        MoveL Offs (a4, 0, 10, 00), v100, fine, CameraMechMind;
        MoveL Camerahomepos, v100, fine, CameraMechMind;
    ENDPROC

    ! 3. Pick watch from WR machine and place back on the tray
    PROC return_to_tray(num slotIndex)
        VAR robtarget current_a1;
        GetSlotTarget slotIndex, current_a1;

        MoveL Offs (a2, 0, -20, 20), v100, fine, CameraMechMind;
        MoveL Offs (a2, 0, 0, 5), v100, fine, CameraMechMind;
        MoveL a2, v100, fine, CameraMechMind;
        Z_GRIP 1, 1, FALSE;
        MoveL Offs (a2, 0, 0, 5), v100, fine, CameraMechMind;
        MoveL Offs (a2, 0, -20, 20), v100, fine, CameraMechMind;
        MoveL Offs (current_a1, 0, 0, 200), v100, fine, CameraMechMind;
        MoveL Offs (current_a1, 0, 0, 00), v100, fine, CameraMechMind;
        Z_RELEASE 1, 1, FALSE;
        MoveL Offs (current_a1, 0, 0, 200), v100, fine, CameraMechMind;
        MoveL Camerahomepos, v100, fine, CameraMechMind;
    ENDPROC


    ! ===== MAIN ORCHESTRATOR PROCEDURE =====
    PROC WROrchestrator2()
        TPWrite "Connecting to server...";
        SocketCreate wr2_sock;
        SocketConnect wr2_sock, WR2_SERVER_IP, WR2_SERVER_PORT;
        TPWrite "Connected.";
        TPWrite "Task: starting.";

        WHILE TRUE DO
            ! Tell server we are ready for a new command
            WaitTime 1;
            SocketSend wr2_sock \Str:="ready";
            
            ! Wait a moment before receiving
            WaitTime 0.2;

            ! Receive message
            wr2_rxStr := "";
            SocketReceive wr2_sock \Str:=wr2_rxStr;

            ! Handle explicit strings instead of dynamic parsing to avoid errors
            IF wr2_rxStr = "PICK_1" THEN
                TPWrite "Picking slot 1";
                pickup_and_place 1;
            ELSEIF wr2_rxStr = "PICK_2" THEN
                TPWrite "Picking slot 2";
                pickup_and_place 2;
            ELSEIF wr2_rxStr = "PICK_3" THEN
                TPWrite "Picking slot 3";
                pickup_and_place 3;
            ELSEIF wr2_rxStr = "PICK_4" THEN
                TPWrite "Picking slot 4";
                pickup_and_place 4;

            ELSEIF wr2_rxStr = "CLOSE_LID" THEN
                TPWrite "Closing lid";
                close_lid;

            ELSEIF wr2_rxStr = "RETURN_1" THEN
                TPWrite "Returning to slot 1";
                return_to_tray 1;
            ELSEIF wr2_rxStr = "RETURN_2" THEN
                TPWrite "Returning to slot 2";
                return_to_tray 2;
            ELSEIF wr2_rxStr = "RETURN_3" THEN
                TPWrite "Returning to slot 3";
                return_to_tray 3;
            ELSEIF wr2_rxStr = "RETURN_4" THEN
                TPWrite "Returning to slot 4";
                return_to_tray 4;

            ELSEIF wr2_rxStr = "wait" THEN
                TPWrite "Waiting...";
                WaitTime 1;

            ELSE
                TPWrite "Unknown task: " + wr2_rxStr;
            ENDIF

        ENDWHILE

        CloseSocketWR2;
        TPWrite "WROrchestrator2: done.";
    ERROR
        TPWrite "Error " + ValToStr(ERRNO) + " in WROrchestrator2().";
        CloseSocketWR2;
    ENDPROC
ENDMODULE
