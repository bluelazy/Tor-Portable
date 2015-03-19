${SegmentFile}

${SegmentInit}

	;http://forum.portableappc.com/viewtopic.php?f=8&t=154
	${If} ${AtLeastWinVista}
		System::Call `shell32::SHGetKnownFolderPath(g"{A520A1A4-1780-4FF6-BD18-167343C5AF16}",i0x4000,in,*w.R0)`
		${SetEnvironmentVariablesPath} LocalLow $R0
	${Else}
		${SetEnvironmentVariablesPath} LocalLow $LOCALAPPDATA ;或其它位置
	${Endif}
!macroend
